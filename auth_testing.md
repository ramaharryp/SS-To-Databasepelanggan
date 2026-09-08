# Auth Testing Playbook — PetaPembeli (JWT Bearer)

Owner credentials: owner@petapembeli.id / Pemilik123!

## API Testing
```
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)
TOKEN=$(curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"owner@petapembeli.id","password":"Pemilik123!"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s "$API/api/auth/me" -H "Authorization: Bearer $TOKEN"
```
Login returns { token, user }. `/api/auth/me` returns the same user using the Bearer token.
Owner-only: GET/POST /api/operators, PATCH /api/operators/{id}/toggle.
