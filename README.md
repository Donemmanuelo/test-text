# WhatsApp Clone

> A self-hosted, real-time messaging application built with a Rust backend and Next.js frontend.

![Rust](https://img.shields.io/badge/Rust-1.80%2B-orange?logo=rust)
![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql)
![Redis](https://img.shields.io/badge/Redis-7-red?logo=redis)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

- **1:1 private messaging** — direct chats between any two users
- **Group chats** — up to 256 members per room
- **Message status** — sent → delivered → read receipts with real-time updates
- **End-to-end encryption** — ChaCha20-Poly1305 symmetric encryption (X25519 key exchange upgrade path)
- **Media uploads** — images and files via S3-compatible presigned URLs
- **User presence** — online indicator and last-seen timestamp
- **Real-time WebSocket fanout** — in-process broadcast + Redis Pub/Sub for multi-server deployments
- **JWT authentication** — short-lived access tokens (15 min) + refresh tokens (7 days), Argon2 password hashing
- **Message editing and soft-delete**
- **Typing indicators**
- **Cursor-based pagination** for message history

---

## Tech Stack

| Layer        | Technology                              | Purpose                                    |
|--------------|-----------------------------------------|--------------------------------------------|
| **Backend**  | Axum 0.7 (Rust)                        | HTTP API + WebSocket server                |
|              | SQLx 0.8                               | Async PostgreSQL driver with compile-time queries |
|              | Redis (deadpool-redis)                 | Pub/Sub fanout, presence, rate limiting    |
|              | ChaCha20-Poly1305                      | Message encryption                         |
|              | Argon2                                 | Password hashing                           |
|              | jsonwebtoken                           | JWT issuance & verification                |
|              | tower-governor                         | Rate limiting middleware                   |
| **Frontend** | Next.js 14 (App Router)               | Server & client React components           |
|              | TypeScript                             | Type safety                                |
|              | Tailwind CSS                           | Utility-first styling                      |
|              | Zustand                                | Global state management                    |
|              | React Query (TanStack Query)           | Server-state caching & mutations           |
|              | native WebSocket API                   | Real-time events                           |
| **Database** | PostgreSQL 16                          | Primary data store (Neon in prod, Docker locally) |
| **Cache**    | Redis 7                                | Pub/Sub, session cache, rate limits        |
| **Storage**  | S3-compatible (Supabase Storage / MinIO) | Media file storage via presigned URLs    |
| **Hosting**  | Railway                                | Rust backend (Docker deploy)              |
|              | Vercel                                 | Next.js frontend (edge-optimised)         |
|              | Neon                                   | Serverless PostgreSQL in production       |
|              | Upstash                                | Serverless Redis in production            |

---

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│                        Client Browser                      │
│                    (Next.js SPA / SSR)                     │
└───────────────────┬───────────────────┬───────────────────┘
                    │ HTTPS REST        │ WSS WebSocket
                    ▼                   ▼
┌───────────────────────────────────────────────────────────┐
│                   Vercel  (Next.js 14)                     │
│   - Server-side rendering & static generation             │
│   - API routes proxy to Railway backend                   │
│   - Edge-cached static assets                             │
└───────────────────────────────┬───────────────────────────┘
                                │ HTTPS / WSS
                                ▼
┌───────────────────────────────────────────────────────────┐
│                 Railway  (Axum Rust API)                   │
│   - Auth: POST /api/auth/*                                │
│   - Users: GET|PATCH /api/users/*                         │
│   - Rooms: GET|POST /api/rooms/*                          │
│   - Messages: GET|POST|PATCH|DELETE /api/rooms/:id/msgs   │
│   - Media presign: POST /api/media/presign                │
│   - WebSocket: WS /api/ws?token=<jwt>                     │
│   - Health: GET /health                                   │
└──────┬───────────────────────┬──────────────────┬─────────┘
       │ SQL (TLS)             │ Redis protocol   │ HTTPS presigned
       ▼                       ▼                  ▼
┌─────────────┐   ┌─────────────────────┐  ┌────────────────┐
│    Neon     │   │  Upstash Redis      │  │ Supabase / S3  │
│ PostgreSQL  │   │  (Pub/Sub, cache,   │  │ Object Storage │
│ (serverless)│   │   rate limit state) │  │ (media files)  │
└─────────────┘   └─────────────────────┘  └────────────────┘
```

**Layer explanations:**

- **Vercel / Next.js** — hosts the React frontend, handles SSR/ISR, and serves the client bundle. All authenticated API calls proxy to the Railway backend.
- **Railway / Axum** — stateless Rust API container. Handles business logic, JWT validation, encryption, and WebSocket connections. Horizontally scalable; Redis Pub/Sub ties multiple instances together.
- **Neon PostgreSQL** — serverless PostgreSQL. Scales to zero between requests, ideal for production cost management.
- **Upstash Redis** — serverless Redis for WebSocket fanout, presence tracking, and rate-limit counters.
- **Supabase Storage / MinIO** — S3-compatible blob store. The backend issues short-lived presigned PUT/GET URLs; the client uploads/downloads media directly.

---

## Getting Started (Local Development)

### Prerequisites

- [Rust (stable, via rustup)](https://rustup.rs/) — `rustup update stable`
- [Node.js 20+](https://nodejs.org/)
- [Docker + Docker Compose](https://docs.docker.com/get-docker/)
- [sqlx-cli](https://github.com/launchbynttdata/sqlx): `cargo install sqlx-cli --no-default-features --features rustls,postgres`
- Git

### Step-by-step setup

**1. Clone the repository**

```bash
git clone https://github.com/your-org/whatsapp-clone.git
cd whatsapp-clone
```

**2. Start PostgreSQL, Redis, and MinIO**

```bash
docker compose up -d
```

Wait for services to become healthy:

```bash
docker compose ps   # all should show "healthy"
```

**3. Configure the backend**

```bash
cp backend/.env.example backend/.env
# Open backend/.env and fill in the values (see Environment Variables section)
```

The defaults in `.env.example` already match the Docker Compose services,
so you only need to set `JWT_SECRET` (any random 32+ char string) for local dev.

**4. Configure the frontend**

```bash
cp frontend/.env.local.example frontend/.env.local
# NEXT_PUBLIC_API_URL=http://localhost:8080
# NEXT_PUBLIC_WS_URL=ws://localhost:8080
```

**5. Run database migrations**

```bash
cd backend
cargo sqlx migrate run
```

**6. Start the backend**

```bash
# still in backend/
cargo run
# API now listening on http://localhost:8080
```

**7. Start the frontend**

```bash
cd ../frontend
npm install
npm run dev
# App now at http://localhost:3000
```

**8. Open the app**

Navigate to [http://localhost:3000](http://localhost:3000) and register an account.

---

## Deployment Guide

### A. Set up Neon (Production Database)

1. Go to [https://neon.tech](https://neon.tech) and create a free account.
2. Click **New Project** → choose the region closest to your Railway region.
3. Name the database `whatsapp_clone`.
4. Copy the **connection string** — it looks like:
   ```
   postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/whatsapp_clone?sslmode=require
   ```
5. Run migrations against Neon from your local machine:
   ```bash
   cd backend
   DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/whatsapp_clone?sslmode=require" \
     cargo sqlx migrate run
   ```

### B. Set up Supabase Storage (Media Files)

1. Go to [https://supabase.com](https://supabase.com) and create a free project.
2. Navigate to **Storage** → **New bucket** → name it `chat-media` → set to **Public**.
3. Go to **Settings** → **Storage** → **S3 Access** → enable S3 compatibility.
4. Copy **Endpoint**, **Access key ID**, and **Secret access key**.
5. These map to: `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
6. Set `S3_BUCKET=chat-media` and `S3_REGION=us-east-1` (or your Supabase region).

### C. Set up Redis (Upstash)

1. Go to [https://upstash.com](https://upstash.com) and create a **Redis** database.
2. Choose the region closest to your Railway deployment.
3. Copy the **Redis URL** — format: `redis://default:password@host:port`
4. This becomes your `REDIS_URL` env var.

### D. Deploy Backend to Railway

1. Push your code to GitHub.
2. Go to [https://railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
3. Select your repository. Set **Root Directory** to `backend`.
4. Railway detects the `Dockerfile` (via `railway.toml`) and builds it automatically.
5. Add all environment variables from `backend/.env.example` under **Variables** in the Railway dashboard.
6. **Important:** Railway injects `$PORT` automatically — ensure `main.rs` reads it:
   ```rust
   let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
   let addr = format!("0.0.0.0:{}", port).parse()?;
   ```
7. Set `DATABASE_URL` to your Neon connection string.
8. After the first successful deploy, copy the generated Railway URL
   (e.g., `https://your-app.railway.app`) — you'll need it for the frontend.

> **Health check:** Railway calls `GET /health` every 30 s. The backend exposes
> this endpoint returning `{ "status": "ok" }` with HTTP 200.

### E. Deploy Frontend to Vercel

1. Go to [https://vercel.com](https://vercel.com) → **New Project** → **Import from GitHub**.
2. Select your repository. Set **Root Directory** to `frontend`.
3. Add these environment variables:
   ```
   NEXT_PUBLIC_API_URL=https://your-app.railway.app
   NEXT_PUBLIC_WS_URL=wss://your-app.railway.app
   ```
4. Click **Deploy** — Vercel auto-detects Next.js and builds it.
5. Your app is live at `https://your-app.vercel.app`.

> **CORS:** Ensure `FRONTEND_URL=https://your-app.vercel.app` is set in the Railway
> backend env vars so Axum's CORS middleware allows the origin.

### F. Alternative: Deploy Backend to Fly.io

```bash
# Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
cd backend
fly launch          # detects Dockerfile, prompts for app name + region
fly secrets set DATABASE_URL="..." REDIS_URL="..." JWT_SECRET="..." # etc.
fly deploy
```

Fly.io will build the Docker image, push it to their registry, and serve it on
`https://your-app.fly.dev`. Update your Vercel env vars accordingly.

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable               | Example                                              | Description                                          |
|------------------------|------------------------------------------------------|------------------------------------------------------|
| `DATABASE_URL`         | `postgresql://postgres:postgres@localhost:5432/whatsapp_clone` | PostgreSQL connection string               |
| `REDIS_URL`            | `redis://localhost:6379`                             | Redis connection string                              |
| `JWT_SECRET`           | `super-secret-random-32-char-string`                 | HMAC-SHA256 signing secret for JWTs                 |
| `JWT_ACCESS_EXPIRY_SECS` | `900`                                              | Access token lifetime in seconds (default: 15 min)  |
| `JWT_REFRESH_EXPIRY_SECS` | `604800`                                          | Refresh token lifetime in seconds (default: 7 days) |
| `S3_ENDPOINT`          | `https://xxx.supabase.co/storage/v1/s3`              | S3-compatible endpoint URL                           |
| `S3_ACCESS_KEY_ID`     | `your-access-key`                                    | S3 access key ID                                     |
| `S3_SECRET_ACCESS_KEY` | `your-secret-key`                                    | S3 secret access key                                 |
| `S3_BUCKET`            | `chat-media`                                         | S3 bucket name for media uploads                     |
| `S3_REGION`            | `us-east-1`                                          | S3 region (or `auto` for Cloudflare R2)             |
| `FRONTEND_URL`         | `http://localhost:3000`                              | Allowed CORS origin                                  |
| `PORT`                 | `8080`                                               | HTTP listen port (auto-set by Railway)               |
| `RUST_LOG`             | `info`                                               | Log level: `trace`, `debug`, `info`, `warn`, `error` |

### Frontend (`frontend/.env.local`)

| Variable                | Example                               | Description                              |
|-------------------------|---------------------------------------|------------------------------------------|
| `NEXT_PUBLIC_API_URL`   | `http://localhost:8080`               | Backend REST API base URL                |
| `NEXT_PUBLIC_WS_URL`    | `ws://localhost:8080`                 | Backend WebSocket base URL               |

---

## Database Migrations

Migrations live in `backend/migrations/` and are managed by **sqlx-cli**.

### Run all pending migrations

```bash
cd backend
cargo sqlx migrate run
```

### Revert the most recent migration

```bash
cargo sqlx migrate revert
```

### Add a new migration

```bash
cargo sqlx migrate add <description>
# e.g.: cargo sqlx migrate add add_reactions_table
# Creates: backend/migrations/YYYYMMDDHHMMSS_add_reactions_table.sql
```

### Offline mode (CI / Docker build without a live DB)

SQLx can verify queries at compile time without a live database by using a
pre-generated metadata file:

```bash
cd backend
cargo sqlx prepare           # writes .sqlx/ directory
git add .sqlx/               # commit this with your PR
```

Set `SQLX_OFFLINE=true` in your CI/Dockerfile environment so `cargo build`
uses the cached metadata instead of connecting to a database.

---

## API Reference

### REST Endpoints

| Method   | Path                              | Auth | Description                                  |
|----------|-----------------------------------|------|----------------------------------------------|
| `POST`   | `/api/auth/register`              | No   | Register with email, password, display_name  |
| `POST`   | `/api/auth/login`                 | No   | Login, returns access + refresh tokens       |
| `POST`   | `/api/auth/refresh`               | No   | Exchange refresh token for new token pair    |
| `POST`   | `/api/auth/logout`                | Yes  | Revoke refresh token                         |
| `GET`    | `/api/users/me`                   | Yes  | Get current user profile                     |
| `PATCH`  | `/api/users/me`                   | Yes  | Update display_name, avatar_url, status      |
| `GET`    | `/api/users/:id`                  | Yes  | Get public profile of any user               |
| `GET`    | `/api/users/search?q=`            | Yes  | Search users by display_name or email        |
| `GET`    | `/api/rooms`                      | Yes  | List rooms the current user belongs to       |
| `POST`   | `/api/rooms`                      | Yes  | Create a room (DM or group)                  |
| `GET`    | `/api/rooms/:id`                  | Yes  | Get room details                             |
| `GET`    | `/api/rooms/:id/members`          | Yes  | List room members                            |
| `POST`   | `/api/rooms/:id/members`          | Yes  | Add a member to a group                      |
| `DELETE` | `/api/rooms/:id/members/:user_id` | Yes  | Remove a member from a group                 |
| `GET`    | `/api/rooms/:id/messages`         | Yes  | Fetch messages (cursor pagination)           |
| `POST`   | `/api/rooms/:id/messages`         | Yes  | Send a message                               |
| `PATCH`  | `/api/messages/:id`               | Yes  | Edit a message                               |
| `DELETE` | `/api/messages/:id`               | Yes  | Soft-delete a message                        |
| `POST`   | `/api/messages/:id/read`          | Yes  | Mark message as read (triggers WS receipt)   |
| `POST`   | `/api/media/presign`              | Yes  | Get a presigned S3 PUT URL for media upload  |
| `GET`    | `/health`                         | No   | Health check — returns `{ "status": "ok" }`  |

### WebSocket Events

Connect to `WS /api/ws?token=<access_jwt>`.

#### Events pushed **from server → client**

| Event              | Payload fields                                         | Description                         |
|--------------------|--------------------------------------------------------|-------------------------------------|
| `message.new`      | `room_id`, `message` (full Message object)            | New message arrived                 |
| `message.edited`   | `room_id`, `message_id`, `content`, `edited_at`       | Message was edited                  |
| `message.deleted`  | `room_id`, `message_id`                               | Message was soft-deleted            |
| `message.status`   | `room_id`, `message_id`, `status`, `user_id`          | Delivered / read receipt update     |
| `presence.update`  | `user_id`, `is_online`, `last_seen`                   | User came online or went offline    |
| `typing.start`     | `room_id`, `user_id`                                  | User started typing                 |
| `typing.stop`      | `room_id`, `user_id`                                  | User stopped typing                 |

#### Events sent **from client → server**

| Event            | Payload fields        | Description                        |
|------------------|-----------------------|------------------------------------|
| `typing.start`   | `room_id`             | Notify others you are typing       |
| `typing.stop`    | `room_id`             | Notify others you stopped typing   |
| `presence.ping`  | *(empty)*             | Keep presence alive (send ~30 s)   |

---

## Security Notes

### JWT Storage Strategy

Access tokens are stored in **memory only** (Zustand store, never `localStorage`).
Refresh tokens are stored in an **HttpOnly Secure SameSite=Strict cookie** set by
the `/api/auth/login` and `/api/auth/refresh` responses.
This protects against XSS (no JS access to refresh token) while remaining CSRF-safe
for the API-only cookie usage pattern.

### End-to-End Encryption

Messages are encrypted client-side with **ChaCha20-Poly1305** before being sent
to the server. The server stores and relays ciphertext only — it never sees
plaintext message content. Key exchange uses **X25519 Diffie-Hellman** for 1:1
chats (each user's key pair is generated in the browser and the public key is
registered with the backend). Group chat encryption uses a symmetric room key
wrapped with each member's public key.

> **Upgrade path:** the current implementation uses a simplified symmetric model
> suitable for an MVP. A full Signal Double-Ratchet protocol implementation is
> the recommended upgrade for production-grade forward secrecy.

### CORS Configuration

The Axum backend uses `tower-http` CORS middleware configured to allow only the
origin specified in `FRONTEND_URL`. **Do not set `FRONTEND_URL=*` in production.**

### Rate Limiting

`tower-governor` middleware enforces per-IP rate limits on all HTTP routes.
Default: 100 requests / 10 seconds per IP. Auth endpoints are additionally
limited to 10 requests / minute to mitigate brute-force attacks.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

---

## License

This project is licensed under the **MIT License**. See [LICENSE](./LICENSE) for details.
