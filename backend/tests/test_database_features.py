"""Tests for Database Pelanggan new features: export, order history, edit, delete."""
import os
import io
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
def seeded_customer(auth_headers):
    """Create a fresh dedicated test customer with 2 orders."""
    phone = "085700110022"
    for oid in ["TEST_EXP_1", "TEST_EXP_2"]:
        row = {
            "order_id": oid, "created_at": "01/01/2026 10:00:00",
            "tiktok_username": "TEST_expuser", "recipient_name": "TEST_ExpBuyer",
            "phone": phone, "affiliate_creator": "TEST_expcreator",
            "full_address_raw": "Jl Ekspor 1\nKel X, Kec Y, Kota Z, Prov Q, Indonesia",
            "address_detail": "Jl Ekspor 1",
            "kelurahan": "Kel X", "kecamatan": "Kec Y",
            "kota": "TEST_KotaExp", "provinsi": "TEST_ProvExp", "negara": "Indonesia",
        }
        requests.post(f"{BASE_URL}/api/customers/save",
                      json={"rows": [row]}, headers=auth_headers, timeout=30)
    # fetch id
    r = requests.get(f"{BASE_URL}/api/customers", params={"search": "TEST_expuser"},
                     headers=auth_headers, timeout=10)
    matches = [c for c in r.json() if c["tiktok_username"] == "TEST_expuser"]
    assert matches
    return matches[0]


# --- Export ---
class TestExport:
    def test_export_csv(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/customers/export",
                         params={"format": "csv"}, headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        assert "attachment" in r.headers.get("content-disposition", "").lower()
        assert ".csv" in r.headers.get("content-disposition", "")
        # Should contain Bahasa Indonesia headers
        body = r.content.decode("utf-8-sig")
        assert "Nama Penerima" in body
        assert "No. HP" in body

    def test_export_xlsx(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/customers/export",
                         params={"format": "xlsx"}, headers=auth_headers, timeout=30)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "spreadsheetml" in ct or "officedocument" in ct
        assert ".xlsx" in r.headers.get("content-disposition", "")
        # xlsx magic bytes = PK zip
        assert r.content[:2] == b"PK"

    def test_export_respects_search(self, auth_headers, seeded_customer):
        r = requests.get(f"{BASE_URL}/api/customers/export",
                         params={"format": "csv", "search": "TEST_expuser"},
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200
        body = r.content.decode("utf-8-sig")
        assert "TEST_ExpBuyer" in body
        # Should not include other unrelated customers
        assert "Rizka" not in body or body.count("\n") <= 3  # header + 1 row

    def test_export_unauth(self):
        r = requests.get(f"{BASE_URL}/api/customers/export",
                         params={"format": "csv"}, timeout=10)
        assert r.status_code == 401


# --- Order history ---
class TestOrderHistory:
    def test_get_orders(self, auth_headers, seeded_customer):
        cid = seeded_customer["id"]
        r = requests.get(f"{BASE_URL}/api/customers/{cid}/orders",
                         headers=auth_headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "customer" in data and "orders" in data
        assert data["customer"]["id"] == cid
        assert data["customer"]["phone"] == "+6285700110022"
        assert isinstance(data["orders"], list)
        assert len(data["orders"]) >= 2
        o0 = data["orders"][0]
        for k in ["order_id", "created_at", "full_address_raw", "affiliate_creator", "captured_at", "captured_by"]:
            assert k in o0

    def test_get_orders_not_found(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/customers/507f1f77bcf86cd799439011/orders",
                         headers=auth_headers, timeout=10)
        assert r.status_code == 404


# --- Edit ---
class TestEditCustomer:
    def test_update_success(self, auth_headers, seeded_customer):
        cid = seeded_customer["id"]
        payload = {
            "recipient_name": "TEST_ExpBuyer_Updated",
            "tiktok_username": "TEST_expuser",
            "phone": "085700110022",  # same phone
            "affiliate_creator": "TEST_expcreator2",
            "address_detail": "Jl Baru 5",
            "kelurahan": "Kel X", "kecamatan": "Kec Y",
            "kota": "TEST_KotaExp", "provinsi": "TEST_ProvExp", "negara": "Indonesia",
        }
        r = requests.put(f"{BASE_URL}/api/customers/{cid}", json=payload,
                         headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        # verify persisted
        r2 = requests.get(f"{BASE_URL}/api/customers", params={"search": "TEST_expuser"},
                          headers=auth_headers, timeout=10)
        matches = [c for c in r2.json() if c["id"] == cid]
        assert matches
        assert matches[0]["recipient_name"] == "TEST_ExpBuyer_Updated"
        assert matches[0]["affiliate_creator"] == "TEST_expcreator2"
        assert matches[0]["address_detail"] == "Jl Baru 5"
        # phone normalized
        assert matches[0]["phone"] == "+6285700110022"

    def test_update_empty_phone(self, auth_headers, seeded_customer):
        cid = seeded_customer["id"]
        r = requests.put(f"{BASE_URL}/api/customers/{cid}",
                         json={"recipient_name": "X", "phone": ""},
                         headers=auth_headers, timeout=10)
        assert r.status_code == 400

    def test_update_duplicate_phone(self, auth_headers, seeded_customer):
        # Create a second customer to clash with
        other_phone = "085700998877"
        requests.post(f"{BASE_URL}/api/customers/save",
                      json={"rows": [{"order_id": "TEST_CLASH_1",
                                      "recipient_name": "TEST_Clasher",
                                      "phone": other_phone,
                                      "tiktok_username": "TEST_clasher"}]},
                      headers=auth_headers, timeout=10)
        cid = seeded_customer["id"]
        r = requests.put(f"{BASE_URL}/api/customers/{cid}",
                         json={"recipient_name": "TEST_ExpBuyer_Updated",
                               "phone": other_phone},
                         headers=auth_headers, timeout=10)
        assert r.status_code == 400
        assert "digunakan" in r.text.lower() or "sudah" in r.text.lower()

    def test_update_not_found(self, auth_headers):
        r = requests.put(f"{BASE_URL}/api/customers/507f1f77bcf86cd799439011",
                         json={"recipient_name": "X", "phone": "081234567890"},
                         headers=auth_headers, timeout=10)
        assert r.status_code == 404


# --- Delete ---
class TestDeleteCustomer:
    def test_delete_removes_customer_and_orders(self, auth_headers):
        # Create fresh throwaway customer
        phone = "085700333344"
        for oid in ["TEST_DEL_1", "TEST_DEL_2"]:
            requests.post(f"{BASE_URL}/api/customers/save",
                          json={"rows": [{"order_id": oid, "recipient_name": "TEST_ToDelete",
                                          "phone": phone, "tiktok_username": "TEST_deluser"}]},
                          headers=auth_headers, timeout=10)
        r = requests.get(f"{BASE_URL}/api/customers", params={"search": "TEST_deluser"},
                         headers=auth_headers, timeout=10)
        matches = [c for c in r.json() if c["tiktok_username"] == "TEST_deluser"]
        assert matches
        cid = matches[0]["id"]

        # Delete
        d = requests.delete(f"{BASE_URL}/api/customers/{cid}",
                            headers=auth_headers, timeout=10)
        assert d.status_code == 200
        assert d.json()["deleted"] is True

        # verify customer gone
        r2 = requests.get(f"{BASE_URL}/api/customers", params={"search": "TEST_deluser"},
                          headers=auth_headers, timeout=10)
        assert not [c for c in r2.json() if c["id"] == cid]

        # verify orders gone
        r3 = requests.get(f"{BASE_URL}/api/customers/{cid}/orders",
                          headers=auth_headers, timeout=10)
        assert r3.status_code == 404

    def test_delete_not_found(self, auth_headers):
        r = requests.delete(f"{BASE_URL}/api/customers/507f1f77bcf86cd799439011",
                            headers=auth_headers, timeout=10)
        assert r.status_code == 404


# --- Regression: dedupe still works with new endpoints in place ---
class TestRegression:
    def test_dedupe_still_works(self, auth_headers):
        phone = "085700555566"
        for oid in ["TEST_REG_1", "TEST_REG_2", "TEST_REG_3"]:
            requests.post(f"{BASE_URL}/api/customers/save",
                          json={"rows": [{"order_id": oid, "recipient_name": "TEST_Reg",
                                          "phone": phone, "tiktok_username": "TEST_reguser"}]},
                          headers=auth_headers, timeout=10)
        r = requests.get(f"{BASE_URL}/api/customers", params={"search": "TEST_reguser"},
                         headers=auth_headers, timeout=10)
        matches = [c for c in r.json() if c["tiktok_username"] == "TEST_reguser"]
        assert matches
        assert matches[0]["order_count"] >= 3
        assert matches[0]["is_repeat"] is True
