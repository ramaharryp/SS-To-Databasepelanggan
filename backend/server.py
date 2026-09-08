from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import re
import json
import base64
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated

import io
import jwt
import bcrypt
from bson import ObjectId
from fastapi import FastAPI, APIRouter, Request, HTTPException, Depends
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, BeforeValidator, ConfigDict, EmailStr

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
VISION_PROVIDER = os.environ.get('VISION_PROVIDER', 'openai')
VISION_MODEL = os.environ.get('VISION_MODEL', 'gpt-5.4')
JWT_ALGORITHM = "HS256"

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Mongo helpers
# ---------------------------------------------------------------------------
PyObjectId = Annotated[str, BeforeValidator(str)]


# ---------------------------------------------------------------------------
# Auth utilities
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Belum masuk (tidak terautentikasi)")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Tipe token tidak valid")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Pengguna tidak ditemukan")
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesi berakhir, silakan masuk kembali")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token tidak valid")


async def require_owner(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Hanya pemilik yang dapat mengakses fitur ini")
    return user


# ---------------------------------------------------------------------------
# Field normalization / parsing
# ---------------------------------------------------------------------------
def normalize_phone(raw: str) -> str:
    if not raw:
        return ""
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return ""
    if digits.startswith("62"):
        rest = digits[2:].lstrip("0")
        return "+62" + rest
    if digits.startswith("0"):
        return "+62" + digits.lstrip("0")
    if digits.startswith("8"):
        return "+62" + digits
    return "+" + digits


def parse_address(raw: str) -> dict:
    """Fallback deterministic parser: last comma line = kelurahan,kecamatan,kota,provinsi,negara."""
    result = {"address_detail": "", "kelurahan": "", "kecamatan": "", "kota": "", "provinsi": "", "negara": ""}
    if not raw:
        return result
    lines = [l.strip() for l in raw.replace("\r", "\n").split("\n") if l.strip()]
    geo_idx = None
    for i in range(len(lines) - 1, -1, -1):
        if "," in lines[i]:
            geo_idx = i
            break
    if geo_idx is None:
        result["address_detail"] = raw.strip()
        return result
    parts = [p.strip() for p in lines[geo_idx].split(",") if p.strip()]
    keys = ["kelurahan", "kecamatan", "kota", "provinsi", "negara"]
    tail = parts[-5:]
    offset = len(keys) - len(tail)
    for i, val in enumerate(tail):
        result[keys[offset + i]] = val
    detail_lines = lines[:geo_idx]
    result["address_detail"] = "\n".join(detail_lines).strip()
    return result


# ---------------------------------------------------------------------------
# AI Vision extraction
# ---------------------------------------------------------------------------
EXTRACTION_PROMPT = """Anda adalah mesin ekstraksi data dari tangkapan layar (screenshot) halaman "Informasi Pesanan" TikTok Shop berbahasa Indonesia.

Baca HANYA teks yang benar-benar tercetak pada gambar. JANGAN menebak, JANGAN mengarang, JANGAN menyimpulkan profesi atau identitas pembeli. Jika sebuah field tidak terlihat di gambar, kembalikan string kosong "".

Ekstrak field berikut:
- order_id: angka pada baris "ID Pesanan".
- created_at: nilai pada "Waktu Pembuatan", format apa adanya (DD/MM/YYYY HH:MM:SS).
- tiktok_username: handle TikTok pembeli yang tampil di bawah judul "Pembeli".
- recipient_name: nama yang tampil di bawah "Alamat pengiriman".
- phone: nomor telepon yang tampil (apa adanya, termasuk (+62) jika ada).
- full_address_raw: SELURUH blok alamat pengiriman persis seperti tercetak, pertahankan pemisahan baris dengan karakter newline.
- affiliate_creator: nilai setelah "Penerima komisi:" pada bagian "Kreator afiliasi". Kosongkan jika tidak ada.

Kemudian PARSING alamat. Baris TERAKHIR yang dipisah koma pada alamat TikTok Indonesia selalu berformat: kelurahan, kecamatan, kota, provinsi, negara. Semua baris di ATAS baris tersebut adalah alamat detail (jalan, blok, RT/RW, patokan). Pecah menjadi:
- address_detail, kelurahan, kecamatan, kota, provinsi, negara

Untuk SETIAP field beri skor keyakinan (confidence) 0.0 - 1.0 yang menyatakan seberapa yakin Anda membacanya dengan benar dari gambar (0.0 jika tidak ada / tidak terbaca).

Balas HANYA dengan JSON valid tanpa teks lain, dengan bentuk:
{
  "fields": {
    "order_id": "", "created_at": "", "tiktok_username": "", "recipient_name": "",
    "phone": "", "full_address_raw": "", "affiliate_creator": "",
    "address_detail": "", "kelurahan": "", "kecamatan": "", "kota": "", "provinsi": "", "negara": ""
  },
  "confidence": {
    "order_id": 0.0, "created_at": 0.0, "tiktok_username": 0.0, "recipient_name": 0.0,
    "phone": 0.0, "full_address_raw": 0.0, "affiliate_creator": 0.0,
    "address_detail": 0.0, "kelurahan": 0.0, "kecamatan": 0.0, "kota": 0.0, "provinsi": 0.0, "negara": 0.0
  }
}"""

FIELD_KEYS = ["order_id", "created_at", "tiktok_username", "recipient_name", "phone",
              "full_address_raw", "affiliate_creator", "address_detail", "kelurahan",
              "kecamatan", "kota", "provinsi", "negara"]


def _strip_data_url(b64: str) -> str:
    if "," in b64 and b64.strip().startswith("data:"):
        return b64.split(",", 1)[1]
    return b64


async def extract_one(image_b64: str, idx: int) -> dict:
    empty = {k: "" for k in FIELD_KEYS}
    conf = {k: 0.0 for k in FIELD_KEYS}
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"extract-{idx}-{datetime.now(timezone.utc).timestamp()}",
            system_message=EXTRACTION_PROMPT,
        ).with_model(VISION_PROVIDER, VISION_MODEL)
        msg = UserMessage(
            text="Ekstrak data dari tangkapan layar ini dan balas dengan JSON sesuai format.",
            file_contents=[ImageContent(image_base64=_strip_data_url(image_b64))],
        )
        resp = await chat.send_message(msg)
        text = resp if isinstance(resp, str) else str(resp)
        text = text.strip()
        if text.startswith("```"):
            text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
            text = re.sub(r"\n?```$", "", text).strip()
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end != -1:
            text = text[start:end + 1]
        data = json.loads(text)
        fields = {**empty, **(data.get("fields") or {})}
        conf = {**conf, **(data.get("confidence") or {})}
    except Exception as e:
        logger.error(f"Ekstraksi gambar {idx} gagal: {e}")
        return {"index": idx, "fields": empty, "confidence": conf, "error": str(e)}

    # Backend-authoritative phone normalization
    fields["phone"] = normalize_phone(fields.get("phone", ""))

    # Fallback address parsing if model left geo blank
    geo_keys = ["kelurahan", "kecamatan", "kota", "provinsi", "negara"]
    if not any(fields.get(k) for k in geo_keys) and fields.get("full_address_raw"):
        parsed = parse_address(fields["full_address_raw"])
        for k, v in parsed.items():
            if not fields.get(k):
                fields[k] = v

    fields = {k: (fields.get(k) or "") for k in FIELD_KEYS}
    conf = {k: float(conf.get(k, 0.0) or 0.0) for k in FIELD_KEYS}
    return {"index": idx, "fields": fields, "confidence": conf}


# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ExtractRequest(BaseModel):
    images: List[str]  # base64 (data URLs allowed)


class SaveRow(BaseModel):
    model_config = ConfigDict(extra="ignore")
    order_id: str = ""
    created_at: str = ""
    tiktok_username: str = ""
    recipient_name: str = ""
    phone: str = ""
    full_address_raw: str = ""
    affiliate_creator: str = ""
    address_detail: str = ""
    kelurahan: str = ""
    kecamatan: str = ""
    kota: str = ""
    provinsi: str = ""
    negara: str = ""


class SaveRequest(BaseModel):
    rows: List[SaveRow]


class OperatorCreate(BaseModel):
    email: EmailStr
    password: str
    name: str = ""


class CustomerUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    recipient_name: str = ""
    tiktok_username: str = ""
    phone: str = ""
    affiliate_creator: str = ""
    address_detail: str = ""
    kelurahan: str = ""
    kecamatan: str = ""
    kota: str = ""
    provinsi: str = ""
    negara: str = ""


# ---------------------------------------------------------------------------
# Routes: Auth
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"message": "PetaPembeli API"}


@api_router.post("/auth/login")
async def login(body: LoginRequest):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email atau kata sandi salah")
    if user.get("active") is False:
        raise HTTPException(status_code=403, detail="Akun dinonaktifkan")
    token = create_access_token(str(user["_id"]), user["email"], user.get("role", "operator"))
    return {
        "token": token,
        "user": {
            "id": str(user["_id"]),
            "email": user["email"],
            "name": user.get("name", ""),
            "role": user.get("role", "operator"),
        },
    }


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {"user": {"id": user["id"], "email": user["email"], "name": user.get("name", ""), "role": user.get("role", "operator")}}


# ---------------------------------------------------------------------------
# Routes: Operators (owner only)
# ---------------------------------------------------------------------------
@api_router.get("/operators")
async def list_operators(user: dict = Depends(require_owner)):
    docs = await db.users.find({}).sort("created_at", 1).to_list(500)
    return [{
        "id": str(d["_id"]),
        "email": d["email"],
        "name": d.get("name", ""),
        "role": d.get("role", "operator"),
        "active": d.get("active", True),
        "created_at": d.get("created_at").isoformat() if isinstance(d.get("created_at"), datetime) else d.get("created_at"),
    } for d in docs]


@api_router.post("/operators")
async def create_operator(body: OperatorCreate, user: dict = Depends(require_owner)):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email sudah terdaftar")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Kata sandi minimal 6 karakter")
    doc = {
        "email": email,
        "password_hash": hash_password(body.password),
        "name": body.name.strip() or email.split("@")[0],
        "role": "operator",
        "active": True,
        "created_at": datetime.now(timezone.utc),
    }
    res = await db.users.insert_one(doc)
    return {"id": str(res.inserted_id), "email": email, "name": doc["name"], "role": "operator", "active": True}


@api_router.patch("/operators/{operator_id}/toggle")
async def toggle_operator(operator_id: str, user: dict = Depends(require_owner)):
    target = await db.users.find_one({"_id": ObjectId(operator_id)})
    if not target:
        raise HTTPException(status_code=404, detail="Operator tidak ditemukan")
    if target.get("role") == "owner":
        raise HTTPException(status_code=400, detail="Tidak dapat menonaktifkan akun pemilik")
    new_active = not target.get("active", True)
    await db.users.update_one({"_id": ObjectId(operator_id)}, {"$set": {"active": new_active}})
    return {"id": operator_id, "active": new_active}


# ---------------------------------------------------------------------------
# Routes: Extraction
# ---------------------------------------------------------------------------
@api_router.post("/extract")
async def extract(body: ExtractRequest, user: dict = Depends(get_current_user)):
    if not body.images:
        raise HTTPException(status_code=400, detail="Tidak ada gambar untuk diekstrak")
    if len(body.images) > 30:
        raise HTTPException(status_code=400, detail="Maksimal 30 gambar per unggahan")
    tasks = [extract_one(img, i) for i, img in enumerate(body.images)]
    results = await asyncio.gather(*tasks)
    results.sort(key=lambda r: r["index"])
    return {"results": results}


# ---------------------------------------------------------------------------
# Routes: Customers / Save
# ---------------------------------------------------------------------------
@api_router.post("/customers/save")
async def save_customers(body: SaveRequest, user: dict = Depends(get_current_user)):
    saved = 0
    new_customers = 0
    repeat_customers = 0
    skipped = 0
    now = datetime.now(timezone.utc)

    for row in body.rows:
        phone = normalize_phone(row.phone)
        if not phone:
            skipped += 1
            continue

        order_doc = {
            "order_id": row.order_id,
            "created_at": row.created_at,
            "tiktok_username": row.tiktok_username,
            "recipient_name": row.recipient_name,
            "phone": phone,
            "full_address_raw": row.full_address_raw,
            "affiliate_creator": row.affiliate_creator,
            "address_detail": row.address_detail,
            "kelurahan": row.kelurahan,
            "kecamatan": row.kecamatan,
            "kota": row.kota,
            "provinsi": row.provinsi,
            "negara": row.negara,
            "captured_at": now.isoformat(),
            "captured_by": user["email"],
        }

        existing = await db.customers.find_one({"phone": phone})
        if existing:
            order_doc["customer_id"] = str(existing["_id"])
            await db.orders.insert_one(order_doc)
            new_count = existing.get("order_count", 1) + 1
            update = {
                "$set": {
                    "order_count": new_count,
                    "last_seen": now.isoformat(),
                    "is_repeat": True,
                    "recipient_name": row.recipient_name or existing.get("recipient_name", ""),
                    "tiktok_username": row.tiktok_username or existing.get("tiktok_username", ""),
                    "affiliate_creator": row.affiliate_creator or existing.get("affiliate_creator", ""),
                    "kelurahan": row.kelurahan or existing.get("kelurahan", ""),
                    "kecamatan": row.kecamatan or existing.get("kecamatan", ""),
                    "kota": row.kota or existing.get("kota", ""),
                    "provinsi": row.provinsi or existing.get("provinsi", ""),
                    "negara": row.negara or existing.get("negara", ""),
                    "address_detail": row.address_detail or existing.get("address_detail", ""),
                    "full_address_raw": row.full_address_raw or existing.get("full_address_raw", ""),
                }
            }
            await db.customers.update_one({"_id": existing["_id"]}, update)
            repeat_customers += 1
        else:
            cust = {
                "recipient_name": row.recipient_name,
                "tiktok_username": row.tiktok_username,
                "phone": phone,
                "address_detail": row.address_detail,
                "kelurahan": row.kelurahan,
                "kecamatan": row.kecamatan,
                "kota": row.kota,
                "provinsi": row.provinsi,
                "negara": row.negara,
                "full_address_raw": row.full_address_raw,
                "affiliate_creator": row.affiliate_creator,
                "order_count": 1,
                "is_repeat": False,
                "first_seen": now.isoformat(),
                "last_seen": now.isoformat(),
                "created_by": user["email"],
            }
            res = await db.customers.insert_one(cust)
            order_doc["customer_id"] = str(res.inserted_id)
            await db.orders.insert_one(order_doc)
            new_customers += 1
        saved += 1

    return {"saved": saved, "new_customers": new_customers, "repeat_customers": repeat_customers, "skipped": skipped}


def to_oid(customer_id: str) -> ObjectId:
    try:
        return ObjectId(customer_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Pelanggan tidak ditemukan")


def build_customer_query(search: str, provinsi: str, kota: str, affiliate: str, repeat_only: bool) -> dict:
    query = {}
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        query["$or"] = [
            {"recipient_name": rx},
            {"phone": rx},
            {"tiktok_username": rx},
        ]
    if provinsi:
        query["provinsi"] = provinsi
    if kota:
        query["kota"] = kota
    if affiliate:
        query["affiliate_creator"] = affiliate
    if repeat_only:
        query["is_repeat"] = True
    return query


@api_router.get("/customers")
async def list_customers(
    user: dict = Depends(get_current_user),
    search: str = "",
    provinsi: str = "",
    kota: str = "",
    affiliate: str = "",
    repeat_only: bool = False,
):
    query = build_customer_query(search, provinsi, kota, affiliate, repeat_only)
    docs = await db.customers.find(query).sort("last_seen", -1).to_list(2000)
    out = []
    for d in docs:
        out.append({
            "id": str(d["_id"]),
            "recipient_name": d.get("recipient_name", ""),
            "tiktok_username": d.get("tiktok_username", ""),
            "phone": d.get("phone", ""),
            "address_detail": d.get("address_detail", ""),
            "kelurahan": d.get("kelurahan", ""),
            "kecamatan": d.get("kecamatan", ""),
            "kota": d.get("kota", ""),
            "provinsi": d.get("provinsi", ""),
            "negara": d.get("negara", ""),
            "affiliate_creator": d.get("affiliate_creator", ""),
            "order_count": d.get("order_count", 1),
            "is_repeat": d.get("is_repeat", False),
            "first_seen": d.get("first_seen", ""),
            "last_seen": d.get("last_seen", ""),
        })
    return out


@api_router.get("/customers/filters")
async def customer_filters(user: dict = Depends(get_current_user)):
    provinsi = [p for p in await db.customers.distinct("provinsi") if p]
    kota = [k for k in await db.customers.distinct("kota") if k]
    affiliate = [a for a in await db.customers.distinct("affiliate_creator") if a]
    return {"provinsi": sorted(provinsi), "kota": sorted(kota), "affiliate": sorted(affiliate)}


@api_router.get("/stats")
async def stats(user: dict = Depends(get_current_user)):
    total = await db.customers.count_documents({})
    repeat = await db.customers.count_documents({"is_repeat": True})
    orders = await db.orders.count_documents({})
    return {"total_customers": total, "repeat_customers": repeat, "total_orders": orders}


EXPORT_COLUMNS = [
    ("recipient_name", "Nama Penerima"),
    ("tiktok_username", "Username TikTok"),
    ("phone", "No. HP"),
    ("address_detail", "Alamat Detail"),
    ("kelurahan", "Kelurahan"),
    ("kecamatan", "Kecamatan"),
    ("kota", "Kota/Kabupaten"),
    ("provinsi", "Provinsi"),
    ("negara", "Negara"),
    ("affiliate_creator", "Kreator Afiliasi"),
    ("order_count", "Total Pesanan"),
    ("is_repeat", "Pembeli Berulang"),
    ("first_seen", "Pesanan Pertama"),
    ("last_seen", "Pesanan Terakhir"),
]


@api_router.get("/customers/export")
async def export_customers(
    user: dict = Depends(get_current_user),
    format: str = "xlsx",
    search: str = "",
    provinsi: str = "",
    kota: str = "",
    affiliate: str = "",
    repeat_only: bool = False,
):
    query = build_customer_query(search, provinsi, kota, affiliate, repeat_only)
    docs = await db.customers.find(query).sort("last_seen", -1).to_list(5000)
    rows = []
    for d in docs:
        row = {}
        for key, label in EXPORT_COLUMNS:
            val = d.get(key, "")
            if key == "is_repeat":
                val = "Ya" if d.get("is_repeat") else "Tidak"
            row[label] = val
        rows.append(row)

    import pandas as pd
    df = pd.DataFrame(rows, columns=[label for _, label in EXPORT_COLUMNS])
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M")

    if format == "csv":
        buf = io.StringIO()
        df.to_csv(buf, index=False)
        data = buf.getvalue().encode("utf-8-sig")
        return StreamingResponse(
            io.BytesIO(data),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="database_pelanggan_{ts}.csv"'},
        )

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Pelanggan")
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="database_pelanggan_{ts}.xlsx"'},
    )


@api_router.get("/customers/{customer_id}/orders")
async def customer_orders(customer_id: str, user: dict = Depends(get_current_user)):
    oid = to_oid(customer_id)
    cust = await db.customers.find_one({"_id": oid})
    if not cust:
        raise HTTPException(status_code=404, detail="Pelanggan tidak ditemukan")
    docs = await db.orders.find({"customer_id": customer_id}).sort("captured_at", -1).to_list(1000)
    orders = [{
        "id": str(d["_id"]),
        "order_id": d.get("order_id", ""),
        "created_at": d.get("created_at", ""),
        "full_address_raw": d.get("full_address_raw", ""),
        "affiliate_creator": d.get("affiliate_creator", ""),
        "captured_at": d.get("captured_at", ""),
        "captured_by": d.get("captured_by", ""),
    } for d in docs]
    return {
        "customer": {
            "id": str(cust["_id"]),
            "recipient_name": cust.get("recipient_name", ""),
            "tiktok_username": cust.get("tiktok_username", ""),
            "phone": cust.get("phone", ""),
        },
        "orders": orders,
    }


@api_router.put("/customers/{customer_id}")
async def update_customer(customer_id: str, body: CustomerUpdate, user: dict = Depends(get_current_user)):
    oid = to_oid(customer_id)
    cust = await db.customers.find_one({"_id": oid})
    if not cust:
        raise HTTPException(status_code=404, detail="Pelanggan tidak ditemukan")
    new_phone = normalize_phone(body.phone)
    if not new_phone:
        raise HTTPException(status_code=400, detail="Nomor HP wajib diisi")
    clash = await db.customers.find_one({"phone": new_phone, "_id": {"$ne": oid}})
    if clash:
        raise HTTPException(status_code=400, detail="Nomor HP sudah digunakan pelanggan lain")
    update = {
        "recipient_name": body.recipient_name,
        "tiktok_username": body.tiktok_username,
        "phone": new_phone,
        "affiliate_creator": body.affiliate_creator,
        "address_detail": body.address_detail,
        "kelurahan": body.kelurahan,
        "kecamatan": body.kecamatan,
        "kota": body.kota,
        "provinsi": body.provinsi,
        "negara": body.negara,
    }
    await db.customers.update_one({"_id": oid}, {"$set": update})
    return {"id": customer_id, **update}


@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, user: dict = Depends(get_current_user)):
    oid = to_oid(customer_id)
    cust = await db.customers.find_one({"_id": oid})
    if not cust:
        raise HTTPException(status_code=404, detail="Pelanggan tidak ditemukan")
    await db.orders.delete_many({"customer_id": customer_id})
    await db.customers.delete_one({"_id": oid})
    return {"deleted": True, "id": customer_id}


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "owner@petapembeli.id").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "Pemilik123!")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Pemilik",
            "role": "owner",
            "active": True,
            "created_at": datetime.now(timezone.utc),
        })
        logger.info(f"Owner account seeded: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password), "role": "owner", "active": True}})


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.customers.create_index("phone", unique=True)
    await seed_admin()


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
