# ProofStamp

Invisible digital stamps for protecting creative work. Upload an image, embed an invisible signature, and verify authenticity later.

## Architecture

```
client/          → React + Vite + Tailwind + shadcn/ui (port 5173)
server/          → Node.js + Express + Prisma (port 3001)
stego-service/   → Python + FastAPI + stegano (port 8000)
prisma/          → Database schema
```

## Quick Start

### 1. Database

Get a PostgreSQL instance (Railway, Supabase, or local). Copy the connection string.

### 2. Environment Variables

```bash
cp server/.env.example server/.env
# Fill in: DATABASE_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, JWT_SECRET, Cloudinary keys
```

### 3. Run Migrations

```bash
cd server
npm run prisma:migrate
```

### 4. Start Services

**Terminal 1 — Stego Service:**
```bash
cd stego-service
source venv/bin/activate
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

- **Process 1:** Google OAuth → Proof Passport creation → Username selection
- **Process 2:** File upload → SHA-256 hash → LSB steganography → Cloudinary storage → Certificate PDF
- **Process 3:** File verification (upload or stamp ID) → Extract stego → Hash comparison → Outcome A/B/C
