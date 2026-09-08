"""PetaPembeli backend tests."""
import os
import base64
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://order-ekstraksi.preview.emergentagent.com').rstrip('/')
OWNER_EMAIL = "owner@petapembeli.id"
OWNER_PASSWORD = "Pemilik123!"

IMG_PATH = "/tmp/test.png"


@pytest.fixture(scope="session")
def owner_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def auth_headers(owner_token):
    return {"Authorization": f"Bearer {owner_token}"}


@pytest.fixture(scope="session")
def image_b64():
    with open(IMG_PATH, "rb") as f:
        return base64.b64encode(f.read()).decode()


# --- Auth ---
class TestAuth:
    def test_login_owner(self, owner_token):
        assert isinstance(owner_token, str) and len(owner_token) > 10

    def test_login_bad(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": OWNER_EMAIL, "password": "wrong"}, timeout=10)
        assert r.status_code == 401

    def test_me(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["email"] == OWNER_EMAIL
        assert u["role"] == "owner"

    def test_me_unauth(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r.status_code == 401


# --- Normalization / parsing via /api/extract not needed; test helpers indirectly through save ---
class TestPhoneNormalization:
    def test_via_save_normalizes_phone(self, auth_headers):
        # Save then fetch to check phone
        row = {
            "order_id": "TEST_NORM_1",
            "recipient_name": "TEST_Phone",
            "phone": "(+62)082388792664",
            "tiktok_username": "TEST_phoneuser",
        }
        r = requests.post(f"{BASE_URL}/api/customers/save",
                          json={"rows": [row]}, headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        # search for it
        r2 = requests.get(f"{BASE_URL}/api/customers",
                          params={"search": "TEST_phoneuser"}, headers=auth_headers, timeout=10)
        assert r2.status_code == 200
        matches = [c for c in r2.json() if c["tiktok_username"] == "TEST_phoneuser"]
        assert matches, "customer not found"
        assert matches[0]["phone"] == "+6282388792664"


# --- Extraction ---
class TestExtract:
    def test_extract_returns_fields(self, auth_headers, image_b64):
        r = requests.post(f"{BASE_URL}/api/extract",
                          json={"images": [image_b64]}, headers=auth_headers, timeout=120)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "results" in data and len(data["results"]) == 1
        res = data["results"][0]
        assert "fields" in res and "confidence" in res
        f = res["fields"]
        print("EXTRACT FIELDS:", f)
        # Check expected values
        assert f.get("phone", "").startswith("+62"), f"phone not normalized: {f.get('phone')}"
        # Expected: kitkatmatcha01_, Rizka F, +6282388792664, catlovers29, Padang, West Sumatra
        assert "kitkatmatcha" in (f.get("tiktok_username", "") or "").lower(), f
        assert "rizka" in (f.get("recipient_name", "") or "").lower(), f
        assert f.get("phone") == "+6282388792664", f
        assert "catlovers29" in (f.get("affiliate_creator", "") or "").lower(), f
        assert "padang" in (f.get("kota", "") or "").lower(), f
        # geo fields present
        assert f.get("provinsi"), f
        # Save for later dedup test
        pytest.extracted_row = f

    def test_extract_no_images(self, auth_headers):
        r = requests.post(f"{BASE_URL}/api/extract",
                          json={"images": []}, headers=auth_headers, timeout=10)
        assert r.status_code == 400

    def test_extract_unauth(self, image_b64):
        r = requests.post(f"{BASE_URL}/api/extract", json={"images": [image_b64]}, timeout=30)
        assert r.status_code == 401


# --- Customer save / dedupe ---
class TestCustomerSave:
    def test_save_new_and_dedupe(self, auth_headers):
        row = {
            "order_id": "TEST_ORD_1",
            "created_at": "16/08/2026 06:56:31",
            "tiktok_username": "TEST_dedupuser",
            "recipient_name": "TEST_Rizka",
            "phone": "082111222333",
            "affiliate_creator": "TEST_creator",
            "full_address_raw": "Jl Test 1\nKel A, Kec B, Kota C, Prov D, Indonesia",
            "address_detail": "Jl Test 1",
            "kelurahan": "Kel A", "kecamatan": "Kec B",
            "kota": "TEST_Kota", "provinsi": "TEST_Prov", "negara": "Indonesia",
        }
        r = requests.post(f"{BASE_URL}/api/customers/save",
                          json={"rows": [row]}, headers=auth_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["saved"] == 1
        assert d["new_customers"] >= 1 or d["repeat_customers"] >= 1

        # Save again to dedupe
        row2 = dict(row, order_id="TEST_ORD_2")
        r2 = requests.post(f"{BASE_URL}/api/customers/save",
                           json={"rows": [row2]}, headers=auth_headers, timeout=30)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["repeat_customers"] == 1

        # Verify order_count
        r3 = requests.get(f"{BASE_URL}/api/customers",
                          params={"search": "TEST_dedupuser"}, headers=auth_headers, timeout=10)
        matches = [c for c in r3.json() if c["tiktok_username"] == "TEST_dedupuser"]
        assert matches, "not found"
        assert matches[0]["order_count"] >= 2
        assert matches[0]["is_repeat"] is True

    def test_save_skips_no_phone(self, auth_headers):
        r = requests.post(f"{BASE_URL}/api/customers/save",
                          json={"rows": [{"recipient_name": "TEST_noPhone", "phone": ""}]},
                          headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert r.json()["skipped"] == 1
        assert r.json()["saved"] == 0


# --- Customers list / filters / stats ---
class TestCustomersList:
    def test_list_and_filters(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/customers", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

        r2 = requests.get(f"{BASE_URL}/api/customers",
                          params={"repeat_only": "true"}, headers=auth_headers, timeout=10)
        assert r2.status_code == 200
        for c in r2.json():
            assert c["is_repeat"] is True

    def test_filters_endpoint(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/customers/filters", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        d = r.json()
        for k in ["provinsi", "kota", "affiliate"]:
            assert k in d and isinstance(d[k], list)

    def test_stats(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/stats", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        d = r.json()
        for k in ["total_customers", "repeat_customers", "total_orders"]:
            assert k in d and isinstance(d[k], int)


# --- Operators ---
class TestOperators:
    OP_EMAIL = "test_operator_pytest@petapembeli.id"
    OP_PASS = "Operator123!"

    def test_list_owner(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/operators", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_and_login_and_toggle(self, auth_headers):
        # Cleanup: if exists, use existing (list & find id)
        list_r = requests.get(f"{BASE_URL}/api/operators", headers=auth_headers, timeout=10)
        existing = next((u for u in list_r.json() if u["email"] == self.OP_EMAIL), None)
        if not existing:
            r = requests.post(f"{BASE_URL}/api/operators",
                              json={"email": self.OP_EMAIL, "password": self.OP_PASS, "name": "TestOp"},
                              headers=auth_headers, timeout=10)
            assert r.status_code == 200, r.text
            op_id = r.json()["id"]
        else:
            op_id = existing["id"]
            # ensure active
            if not existing["active"]:
                requests.patch(f"{BASE_URL}/api/operators/{op_id}/toggle", headers=auth_headers, timeout=10)

        # Operator login
        lr = requests.post(f"{BASE_URL}/api/auth/login",
                           json={"email": self.OP_EMAIL, "password": self.OP_PASS}, timeout=10)
        assert lr.status_code == 200, lr.text
        op_token = lr.json()["token"]

        # Operator cannot list operators
        forbidden = requests.get(f"{BASE_URL}/api/operators",
                                 headers={"Authorization": f"Bearer {op_token}"}, timeout=10)
        assert forbidden.status_code == 403

        # Toggle to inactive
        t = requests.patch(f"{BASE_URL}/api/operators/{op_id}/toggle",
                           headers=auth_headers, timeout=10)
        assert t.status_code == 200
        assert t.json()["active"] is False

        # Login should now be forbidden
        lr2 = requests.post(f"{BASE_URL}/api/auth/login",
                            json={"email": self.OP_EMAIL, "password": self.OP_PASS}, timeout=10)
        assert lr2.status_code == 403

        # Toggle back active for reuse
        requests.patch(f"{BASE_URL}/api/operators/{op_id}/toggle", headers=auth_headers, timeout=10)
