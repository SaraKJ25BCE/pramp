# ProofStamp

Invisible digital stamps for protecting creative work. Upload a file (images, documents, audio, video, etc.), register a cryptographic hash and RSA identity signature, optionally embed resilient image watermarks for photos, and verify authenticity later through multiple layers.

**Why ProofStamp?** (vs. Blockchain/NFT/Email-yourself)
> **Blockchain/NFTs** are public, expensive, and require crypto wallets; **emailing yourself** is legally flimsy and easily spoofed. ProofStamp offers **cryptographically secure, legally compliant (BSA 2023 Sec 63), privacy-first digital forensics**—without gas fees or making your private work public.

## Architecture

```
client/          → React + Vite + Tailwind + shadcn/ui (port 5173)
server/          → Node.js + Express + Prisma (port 3001)
stego-service/   → Python + FastAPI + Pillow (DWT‑DCT watermark & perceptual hashes) (port 8000)
prisma/          → Database schema & migrations (`prisma/migrations/` is versioned)
```

## Quick Start

The fastest way to run all 3 services locally is using **Docker Compose**:
```bash
docker compose up --build
```
For detailed local setup instructions, please refer to the [Local Setup Guide](docs/local-setup.md).

### Manual Setup

If you prefer to run services manually:


### 1. Database

Get a PostgreSQL instance (Railway, Supabase, or local). Copy the connection string.

### 2. Environment Variables

```bash
cp server/.env.example server/.env
# Fill in: DATABASE_URL, Google OAuth keys, JWT_SECRET, Cloudinary keys, SERVER_URL,
# CLIENT_URL, KEY_ENCRYPTION_KEY, STEGO_SERVICE_URL, optional TinEye/Google Vision monitoring keys
```

### 3. Run Migrations

```bash
cd server
npm install
npm run prisma:migrate
```

This applies migrations from [`prisma/migrations`](/prisma/migrations/).

### 4. Start Services

**Terminal 1 — Stego Service:**

```bash
cd stego-service
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Terminal 2 — Backend:**

```bash
cd server
npm run dev
```

**Terminal 3 — Frontend:**

```bash
cd client
npm run dev
```

## Processes

- **Identity:** Google OAuth → Proof Passport (`PP-YYYY-XXXXX`) with RSA‑2048 keypair (private keys stored encrypted at rest when `KEY_ENCRYPTION_KEY` is set).
- **Stamp:** File upload → SHA‑256 fingerprint → RSA signature tied to Passport → sequential proof chain linking block hashes → for raster images only: perceptual hashing (pHash/dHash), optional embeddings, **DWT‑DCT invisible watermark**, Cloudinary originals, Certificate PDF generated in background.
- **Verification:** Upload or Stamp ID lookup → Exact hash → Perceptual / embedding similarity → watermark extract → cryptographic signature & chain checks where applicable → outcomes **A** (verified) / **B** (tampering / conflicting evidence / mismatch) / **C** (not found).

### Legal proof (enabled for all users)

Every stamp includes:

- **RFC 3161** timestamp (FreeTSA by default; set `TSA_URL` / `TSA_CA_CERT_PATH`)
- **BSA 2023 Section 63** system certificate PDF (India electronic evidence helper)
- **Counsel Evidence Packet** — `GET /legal/:stampId/litigation-pack` (authenticated; requires creator attestation)
- **Creator attestation** — `POST /legal/:stampId/attest`
- **Monitor capabilities** — `GET /monitor/capabilities`
- **Artifacts catalog** — `GET /legal/:stampId/artifacts`

### Environment variables (server)

| Variable | Purpose |
|----------|---------|
| `STAMP_QUOTA_DISABLED` | `false` = enforce fair-use monthly cap (`STAMP_FAIR_USE_MONTHLY`) |
| `STAMP_FAIR_USE_MONTHLY` | e.g. `500` — generous monthly cap for all users |
| `TSA_MODE` | `development` (default, FreeTSA OK) or `production` (commercial TSA URL) |
| `TSA_URL` | RFC 3161 timestamp authority (default `https://freetsa.org/tsr`) |
| `TSA_PROVIDER_NAME` | Display label in UI and proof bundle |
| `TSA_CA_CERT_PATH` | PEM bundle for OpenSSL chain verify (bundled: `server/certs/freetsa-cacert.pem`) |
| `TSA_OPTIONAL` | `true` = allow stamps if TSA fails |
| `LEGAL_PROOF_DISABLED` | `true` disables Section 63 cert + mandatory TSA |
| `BLOCKCHAIN_ANCHOR_DISABLED` | `false` enables nightly OpenTimestamps Merkle anchor job |
| `TINEYE_API_KEY` | Enables web reverse-image monitoring |
| `GOOGLE_VISION_CREDENTIALS_PATH` | Optional second monitoring engine |
| `SMTP_*` or `RESEND_API_KEY` | Email alerts (in-app alerts always on) |

### Optional integrations

| Feature | ENV / notes |
|---------|--------------|
| Webhook notifications | Save `PATCH /passport/settings/webhook` `{ "webhookUrl": "https://..." }`; monitor alerts & takedown status updates POST JSON payloads |
| API keys | `POST /passport/api-keys`, then authenticate stamp APIs with header `X-ProofStamp-Api-Key` (same permissions as Bearer JWT user) |
| External monitoring | TinEye (`TINEYE_API_KEY`) and/or Google Vision web detection (`GOOGLE_VISION_CREDENTIALS_PATH`) for reverse image search alerts |
| Embeddable badge | `<iframe src="{SERVER_URL}/embed/badge/{STAMP_ID}" />` |

## Prisma migrations

Commits under `prisma/migrations/` reproduce the Postgres schema (`User`, `Passport`, `Stamp`, monitors, anchors, optional `ApiKey`, etc.). For a fresh DB, use `npm run prisma:migrate` from `server/`; prefer **not** to rely solely on `db push` in production.

