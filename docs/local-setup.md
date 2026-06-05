# Local Setup Guide

This guide explains how to quickly spin up the entire ProofStamp architecture locally using Docker Compose.

## Prerequisites
- [Docker](https://docs.docker.com/get-docker/) installed and running.
- [Docker Compose](https://docs.docker.com/compose/install/) (usually included with Docker Desktop).

## Quick Start (Docker Compose)

The easiest way to run the project locally without having to manually manage Python virtual environments, Node.js installations, and PostgreSQL instances is to use our provided `docker-compose.yml`.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/CodeThread386/pramp.git
   cd pramp
   ```

2. **Run Docker Compose:**
   ```bash
   docker compose up --build
   ```
   *Note: On your first run, it will install Node.js modules and Python dependencies inside the containers. This might take a couple of minutes.*

3. **Access the Services:**
   - **Frontend (Client):** [http://localhost:5173](http://localhost:5173)
   - **Backend (Server):** [http://localhost:3001](http://localhost:3001)
   - **Steganography (FastAPI):** [http://localhost:8000](http://localhost:8000)
   - **Database (PostgreSQL):** `localhost:5432` (User: `postgres`, Password: `password`)

### Troubleshooting

- **Database Migrations:** The `server` container automatically runs `prisma migrate deploy` on startup. If you make schema changes, you'll need to generate a new migration manually inside the `server` directory using `npx prisma migrate dev`.
- **Environment Variables:** For basic local development, the `docker-compose.yml` provides the necessary defaults. For advanced features (like Google OAuth, Cloudinary, TinEye), copy `.env.example` to `.env` in the `server/` and `client/` directories and provide your keys, then restart your containers.

## Manual Setup

If you prefer to run things natively without Docker, refer to the [README.md](../README.md) for individual service setup instructions.
