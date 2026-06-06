# Local Setup Guide

This guide explains how to quickly spin up the entire ProofStamp architecture locally using Docker Compose.

## Prerequisites
- [Docker](https://docs.docker.com/get-docker/) installed and running.
- [Docker Compose](https://docs.docker.com/compose/install/) (usually included with Docker Desktop).

## Quick Start (Docker Compose)

The easiest way to run the project locally without having to manually manage Python virtual environments, Node.js installations, and PostgreSQL instances is to use our provided `docker-compose.yml`.

### 1. Clone the repository
```bash
git clone https://github.com/CodeThread386/pramp.git
cd pramp
```

### 2. Configure Environment Variables (Required)
The backend **will crash on startup** if it doesn't have its required cryptographic keys. You must create the environment file before starting the containers:

```bash
cd server
cp .env.example .env
```
Open `server/.env` and replace `your_jwt_secret_change_this` and `your_64_char_hex_key` with random strings. 

*(Note: There is no `.env.example` needed for the `client/` directory because the frontend uses the default API URL configured in docker-compose).*

### 3. Run Docker Compose
Go back to the root directory and start the stack:
```bash
cd ..
docker compose up --build
```
*Note: On your first run, it will install Node.js modules and Python dependencies inside the containers. This might take a couple of minutes.*

### 4. Access the Services
- **Frontend (Client):** [http://localhost:5173](http://localhost:5173)
- **Backend (Server):** [http://localhost:3001](http://localhost:3001)
- **Steganography (FastAPI):** [http://localhost:8000](http://localhost:8000)
- **Database (PostgreSQL):** `localhost:5432` (User: `postgres`, Password: `password`)

## Troubleshooting

- **Database Connection Errors on First Boot:** Postgres takes a few seconds to initialize. If the `server` container crashes saying "Cannot connect to database" during migration, just let it restart or press `Ctrl+C` and run `docker compose up` again.
- **Database Migrations:** The `server` container automatically runs `prisma migrate deploy` on startup. If you make schema changes, you'll need to generate a new migration manually inside the `server` directory using `npx prisma migrate dev`.

## Manual Setup
If you prefer to run things natively without Docker, refer to the [README.md](../README.md) for individual service setup instructions.
