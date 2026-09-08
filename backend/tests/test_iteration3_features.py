"""Iteration 3 tests: region stats, note/labels persistence, label filter, export cols, extract cap."""
import os
import base64
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://order-ekstraksi.preview.emergentagent.com').rstrip('/')
OWNER_EMAIL = "owner@petapembeli.id"
OWNER_PASSWORD = "Pemilik123!"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def customer_with_labels(auth_headers):
    """Create a customer, then PUT to set note+labels."""
    phone = "085711220033"
    row = {
        "order_id": "TEST_IT3_LBL_1",
        "recipient_name": "TEST_LabelBuyer",
        "phone": phone,
        "tiktok_username": "TEST_labeluser",
        "provinsi": "TEST_ProvIT3",
        "kota": "TEST_KotaIT3",
        "kelurahan": "Kel A", "kecamatan": "Kec B",
        "negara": "Indonesia",
    }
    requests.post(f"{BASE_URL}/api/customers/save",
                  json={"rows": [row]}, headers=auth_headers, timeout=30)
    r = requests.get(f"{BASE_URL}/api/customers", params={"search": "TEST_labeluser"},
                     headers=auth_headers, timeout=10)
    matches = [c for c in r.json() if c["tiktok_username"] == "TEST_labeluser"]
    assert matches
    cid = matches[0]["id"]
    put = requests.put(f"{BASE_URL}/api/customers/{cid}", json={
        "recipient_name": "TEST_LabelBuyer",
        "tiktok_username": "TEST_labeluser",
        "phone": phone,
        "affiliate_creator": "",
        "address_detail": "",
        "kelurahan": "Kel A", "kecamatan": "Kec B",
        "kota": "TEST_KotaIT3", "provinsi": "TEST_ProvIT3", "negara": "Indonesia",
        "note": "Prefer kurir COD",
        "labels": ["VIP", "Reseller"],
    }, headers=auth_headers, timeout=10)
    assert put.status_code == 200, put.text
    return cid


class TestRegionStats:
    def test_by_provinsi_sorted_desc(self, auth_headers, customer_with_labels):
        r = requests.get(f"{BASE_URL}/api/stats/regions", params={"by": "provinsi"},
                         headers=auth_headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        for item in data:
            assert "name" in item and "count" in item and "orders" in item
            assert item["name"] not in ("", None)
        counts = [d["count"] for d in data]
        assert counts == sorted(counts, reverse=True)

    def test_by_kota(self, auth_headers, customer_with_labels):
        r = requests.get(f"{BASE_URL}/api/stats/regions", params={"by": "kota"},
                         headers=auth_headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert any(d["name"] == "TEST_KotaIT3" for d in data)


class TestNoteLabelsPersistence:
    def test_get_returns_note_and_labels(self, auth_headers, customer_with_labels):
        r = requests.get(f"{BASE_URL}/api/customers", params={"search": "TEST_labeluser"},
                         headers=auth_headers, timeout=10)
        assert r.status_code == 200
        rows = [c for c in r.json() if c["id"] == customer_with_labels]
        assert rows
        c = rows[0]
        assert c["note"] == "Prefer kurir COD"
        assert set(c["labels"]) == {"VIP", "Reseller"}


class TestLabelFilter:
    def test_filter_by_label_vip(self, auth_headers, customer_with_labels):
        r = requests.get(f"{BASE_URL}/api/customers", params={"label": "VIP"},
                         headers=auth_headers, timeout=10)
        assert r.status_code == 200
        rows = r.json()
        assert all("VIP" in (c.get("labels") or []) for c in rows)
        assert any(c["id"] == customer_with_labels for c in rows)

    def test_filters_endpoint_returns_labels_list(self, auth_headers, customer_with_labels):
        r = requests.get(f"{BASE_URL}/api/customers/filters", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "labels" in data
        assert "VIP" in data["labels"]
        assert "Reseller" in data["labels"]


class TestExportColumns:
    def test_csv_includes_label_and_catatan(self, auth_headers, customer_with_labels):
        r = requests.get(f"{BASE_URL}/api/customers/export",
                         params={"format": "csv", "search": "TEST_labeluser"},
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200
        body = r.content.decode("utf-8-sig")
        assert "Label" in body
        assert "Catatan" in body
        # data row contains joined labels and note
        assert "VIP" in body
        assert "Reseller" in body
        assert "Prefer kurir COD" in body

    def test_csv_respects_label_filter(self, auth_headers, customer_with_labels):
        r = requests.get(f"{BASE_URL}/api/customers/export",
                         params={"format": "csv", "label": "VIP"},
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200
        body = r.content.decode("utf-8-sig")
        assert "TEST_LabelBuyer" in body

    def test_xlsx_still_works(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/customers/export", params={"format": "xlsx"},
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert r.content[:2] == b"PK"


# 1x1 transparent PNG
_TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII="
)
TINY_B64 = "data:image/png;base64," + base64.b64encode(_TINY_PNG).decode()


class TestExtractCap:
    def test_reject_61_images(self, auth_headers):
        payload = {"images": [TINY_B64] * 61}
        r = requests.post(f"{BASE_URL}/api/extract", json=payload,
                          headers=auth_headers, timeout=30)
        assert r.status_code == 400
        assert "60" in r.text or "maksimal" in r.text.lower()

    def test_empty_rejected(self, auth_headers):
        r = requests.post(f"{BASE_URL}/api/extract", json={"images": []},
                          headers=auth_headers, timeout=10)
        assert r.status_code == 400

    def test_small_batch_returns_per_image(self, auth_headers):
        # 2 tiny images - AI will likely produce empty fields but structure must be right
        r = requests.post(f"{BASE_URL}/api/extract", json={"images": [TINY_B64, TINY_B64]},
                          headers=auth_headers, timeout=120)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "results" in data
        assert len(data["results"]) == 2
        for i, res in enumerate(data["results"]):
            assert res["index"] == i
            assert "fields" in res and "confidence" in res
            # required fields present in schema
            for k in ["order_id", "phone", "provinsi", "kota"]:
                assert k in res["fields"]
                assert k in res["confidence"]
