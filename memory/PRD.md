# PetaPembeli — PRD

## Problem Statement
App for an Indonesian TikTok Shop seller that turns screenshots of order/buyer detail pages into a structured, deduplicated customer database. All UI in Bahasa Indonesia. Email+password login with one owner account that can create operator accounts. Core is AI-vision extraction of order screenshots → quick-correct review → save to customer database (deduped by phone).

## Architecture
- Backend: FastAPI (`/app/backend/server.py`), MongoDB (motor), JWT Bearer auth (bcrypt), AI vision via emergentintegrations LlmChat (VISION_PROVIDER=openai, VISION_MODEL=gpt-5.4, Emergent Universal Key).
- Frontend: React (CRA + craco), Tailwind, sonner toasts, lucide icons. Auth token in localStorage, axios instance in `src/lib/api.js`.
- Collections: `users` (owner/operator), `customers` (unique index on phone), `orders`.

## User Personas
- Pemilik (Owner): full access + operator management.
- Operator: upload, extract, save, view database.

## Core Requirements (static)
- Bahasa Indonesia UI throughout.
- Extract: order_id, created_at (DD/MM/YYYY HH:MM:SS), tiktok_username, recipient_name, phone (+62 normalized), full_address_raw, affiliate_creator; parse address into address_detail/kelurahan/kecamatan/kota/provinsi/negara (last comma line = geo).
- Quick-correct inline table with per-field confidence flag (<0.85 = "Periksa").
- Dedupe by phone: increment order_count, update last_seen, keep first_seen, is_repeat=true. Each capture stored as its own order.
- Database Pelanggan: searchable/filterable, Pembeli Berulang badge.
- No TikTok API / scraping / external lookups. Only extract what's printed on the image.

## Implemented (2026-09-08)
- JWT auth (owner seeded owner@petapembeli.id / Pemilik123!), operator create + activate/deactivate (owner-only).
- Upload & Ekstraksi: multi-image drag-drop, parallel AI vision extraction, backend phone normalization + address-parse fallback.
- Quick-correct review table with inline edit, confidence flags, verify/delete rows, save (skips rows without phone).
- Database Pelanggan: stats cards, search, provinsi/kota/affiliate filters, repeat-only toggle, Pembeli Berulang badge, Indonesian date formatting.
- Kelola Operator screen (owner-only).
- Verified end-to-end: backend 100%, frontend 100% (iteration_1).

## Backlog / Remaining (P1/P2)
- P1: Bulk export of Database Pelanggan to CSV/Excel.
- P1: Order-history detail view per customer.
- P2: Edit/delete customer records from the database screen.
- P2: WhatsApp deep-link from phone numbers.

## Next Tasks
- Await user feedback on extraction accuracy with more real screenshots.
