# WhatsApp Clone

> A self-hosted, real-time messaging application built with a Rust + Axum backend and a Next.js frontend — with 1:1 chats, groups, media sharing, and peer-to-peer voice/video calls.

![Rust](https://img.shields.io/badge/Rust-1.80%2B-orange?logo=rust)
![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql)
![Redis](https://img.shields.io/badge/Redis-7-red?logo=redis)
![WebRTC](https://img.shields.io/badge/WebRTC-peer--to--peer-blueviolet)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

**Messaging**

- **1:1 private chats** and **group chats** (create groups, add members, admin badges)
- **DM deduplication** — starting a chat with someone you already talk to reuses the existing room
- **Read receipts** — sent → delivered → read ticks with real-time updates
- **Unread badges**, **typing indicators**, and **presence** (online / last-seen)
- **Message actions** — reply (with quote preview), edit (own text messages), soft-delete (own messages)
- **Cursor-based pagination** for message history (oldest → newest, "load older" on scroll)

**Media**

- **Inline media rendering** — images, videos, audio, and generic files inside message bubbles
- **Camera capture** — take a photo from the composer and send it as an image message
- **S3-compatible storage** (MinIO locally, Supabase Storage in production) via short-lived presigned URLs

**Voice & video calls**

- **Peer-to-peer WebRTC** calls (voice and video) with in-app signaling over the existing WebSocket
- Incoming-call screen with **ringtone**, outgoing ringback, **call timer**, **mute**, and a mirrored local video preview (picture-in-picture)
- Automatic cleanup on hangup, missed-call handling, and connection-loss detection (watchdog)

**App & settings**

- **Settings page** — profile (avatar upload, display name, status message), notification toggles (**message sounds** + **desktop notifications**), and chat prefs (**Enter-to-send**, **message previews**), all persisted in the browser
- **Chat header menu** — contact/group info, search in chat (live filtering), mute/unmute notifications, leave group / delete chat
- **JWT auth** — short-lived access tokens + refresh-token rotation, Argon2 password hashing

---

## Tech Stack

| Layer        | Technology                                   | Purpose                                       |
|--------------|----------------------------------------------|-----------------------------------------------|
| **Backend**  | Axum 0.7 (Rust)                              | HTTP API + WebSocket server                   |
|              | SQLx 0.8                                     | Async PostgreSQL with compile-time queries    |
|              | Redis (deadpool-redis)                       | Pub/Sub fanout + presence tracking            |
|              | Argon2                                       | Password hashing                              |
|              | jsonwebtoken                                 | JWT issuance & verification                   |
|              | aws-sdk-s3                                   | Presigned URLs for media uploads              |
| **Frontend** | Next.js 14 (App Router)                      | Server & client React components              |
|              | TypeScript                                   | Type safety                                   |
|              | Tailwind CSS                                 | Utility-first styling                         |
|              | Zustand                                      | Global state (auth, chat, settings, calls)    |
|              | TanStack Query                               | Server-state caching & mutations              |
|              | native WebSocket API                         | Real-time events                              |
|              | native WebRTC (RTCPeerConnection)            | Peer-to-peer voice/video calls                |
| **Database** | PostgreSQL 16                                | Primary data store (Neon in prod, Docker locally) |
| **Cache**    | Redis 7                                      | Pub/Sub + presence                            |
| **Storage**  | S3-compatible (MinIO / Supabase Storage)     | Media files via presigned URLs                |
| **Hosting**  | Railway (backend) + Vercel (frontend)        | Reference production deployment               |

> **Note on encryption:** the backend includes a ChaCha20-Poly1305 / X25519 crypto module as *scaffolding* for future end-to-end encryption, but it is **not yet wired into message flows** — messages are currently stored in plaintext. Do not treat this project as secure for production data.

---

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│                        Client Browser                      │
│      (Next.js SPA — messaging UI + WebRTC call layer)      │
└───────────────────┬───────────────────┬───────────────────┘
                    │ HTTPS REST        │ WSS WebSocket
                    ▼                   ▼
┌───────────────────────────────────────────────────────────┐
│                  Vercel  (Next.js 14)                      │
│   - SPA pages for chat, room, and settings                 │
│   - /api/auth/* routes proxy refresh/logout to the backend │
└───────────────────────────────┬───────────────────────────┘
                                │ HTTPS / WSS
                                ▼
┌───────────────────────────────────────────────────────────┐
│                 Railway  (Axum Rust API)                   │
│   - Auth: POST /api/auth/*                                │
│   - Users: GET|PATCH /api/users/*                         │
│   - Rooms: GET|POST /api/rooms/*                          │
│   - Messages: GET|POST|PATCH|DELETE /api/rooms/:id/messages│
│   - Media presign: POST /api/media/presign(-avatar)       │
│   - WebSocket: WS /api/ws?token=<jwt>  (messages, presence,│
│     typing, read receipts, call signaling)                │
│   - Health: GET /health                                   │
└──────┬───────────────────────┬──────────────────┬─────────┘
       │ SQL (TLS)             │ Redis protocol   │ HTTPS presigned
       ▼                       ▼                  ▼
┌─────────────┐   ┌─────────────────────┐  ┌────────────────┐
│    Neon     │   │  Upstash Redis      │  │ Supabase / S3  │
│ PostgreSQL  │   │  (Pub/Sub, presence)│  │ Object Storage │
│ (serverless)│   └─────────────────────┘  │ (media files)  │
└─────────────┘                             └────────────────┘
```

**How calls work:** signaling (`call.offer` / `call.answer` / `call.ice` / `call.end` / `call.decline`) is relayed through the backend WebSocket so the two browsers can find each other. Once the peer connection is established, **audio and video flow directly browser-to-browser** (WebRTC) — media never touches the server. A STUN server (`stun.l.google.com`) helps with NAT traversal; no TURN server is configured, so calls across restrictive networks may not connect.

---

## Getting Started (Local Development)

### Prerequisites

- [Rust (stable, via rustup)](https://rustup.rs/)
- [Node.js 20+](https://nodejs.org/)
- [Docker + Docker Compose](https://docs.docker.com/get-docker/)
- [sqlx-cli](https://github.com/launchbynttdata/sqlx): `cargo install sqlx-cli --no-default-features --features rustls,postgres`

### Step-by-step setup

**1. Clone the repository**

```bash
git clone https://github.com/your-org/whatsapp-clone.git
cd whatsapp-clone
```

**2. Start PostgreSQL, Redis, and MinIO**

```bash
docker compose up -d
docker compose ps   # all three should show "healthy"
```

**3. Create the MinIO bucket (once)**

The bucket name defaults to `chat-media`. Create it and make it **public**
(media URLs are served directly by MinIO):

1. Open the MinIO console at [http://localhost:9001](http://localhost:9001) and sign in with `minioadmin` / `minioadmin`.
2. **Buckets** → **Create Bucket** → name it `chat-media` → **Create**.
3. Select the bucket → **Access Policy** → set **Download** (public read) → **Set**.

> A **public** bucket is required — the frontend loads images/videos straight
> from the object URL. (This mirrors Supabase Storage's public-bucket pattern.)
> CLI users can do the same with the `minio/mc` client:
> `docker run --rm --network host minio/mc mb local/chat-media` etc.

**4. Configure the backend**

```bash
cp backend/.env.example backend/.env
# Set JWT_SECRET to any random 32+ char string. All other defaults already
# match the docker-compose services.
```

**5. Configure the frontend**

```bash
cp frontend/.env.local.example frontend/.env.local
```

**6. Run database migrations**

```bash
cd backend
cargo sqlx migrate run
```

**7. Start the backend** (listens on http://localhost:8080)

```bash
cargo run
```

**8. Start the frontend** (at http://localhost:3000)

```bash
cd ../frontend
npm install
npm run dev
```

**9. Open the app**

Navigate to [http://localhost:3000](http://localhost:3000) and register an account.
For a real-time test, open a second browser (or incognito window), register
another user, and start a chat.

> **Camera access:** `getUserMedia` (camera capture + video calls) only works on
> `localhost` or HTTPS origins. Video calls also need a working webcam on both ends.

---

## Deployment Guide

### A. Set up Neon (Production Database)

1. Create a free project at [https://neon.tech](https://neon.tech).
2. Copy the **connection string** (e.g. `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/whatsapp_clone?sslmode=require`).
3. Run migrations against it:
   ```bash
   cd backend
   DATABASE_URL="<neon-connection-string>" cargo sqlx migrate run
   ```

### B. Set up Supabase Storage (Media Files)

1. Create a free project at [https://supabase.com](https://supabase.com).
2. **Storage** → **New bucket** → name it `chat-media` → set to **Public**.
3. **Settings** → **Storage** → **S3 Access** → enable S3 compatibility.
4. Copy **Endpoint**, **Access key ID**, and **Secret access key** → these map to `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`.
5. Set `S3_BUCKET=chat-media` and `S3_REGION=us-east-1` (or your Supabase region).

### C. Set up Redis (Upstash)

Create a Redis database at [https://upstash.com](https://upstash.com) and copy its URL (`redis://default:password@host:port`) as `REDIS_URL`.

### D. Deploy the Backend to Railway

1. Push your code to GitHub.
2. [https://railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
3. Select the repo; set **Root Directory** to `backend` (the `railway.toml` + `Dockerfile` are picked up automatically).
4. Add all variables from `backend/.env.example` under **Variables** (Railway injects `PORT` itself; set `DATABASE_URL` to your Neon string).
5. Railway's health check hits `GET /health` (returns `{ "status": "ok" }`) every 30s.

### E. Deploy the Frontend to Vercel

1. [https://vercel.com](https://vercel.com) → **New Project** → **Import from GitHub**, root directory `frontend`.
2. Add environment variables:
   ```
   NEXT_PUBLIC_API_URL=https://your-app.railway.app
   NEXT_PUBLIC_WS_URL=wss://your-app.railway.app
   ```
3. Backend env: set `CORS_ORIGIN=https://your-app.vercel.app` so Axum's CORS allows the origin.

> **Note:** WebRTC calls use STUN only (no TURN). For production reliability on
> restrictive networks, add a TURN server (e.g. Cloudflare Calls or coturn) to
> `RTC_CONFIG` in `frontend/src/lib/rtc.ts`.

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable                    | Default                          | Description                                              |
|-----------------------------|----------------------------------|----------------------------------------------------------|
| `DATABASE_URL`              | *(required)*                     | PostgreSQL connection string                             |
| `REDIS_URL`                 | *(required)*                     | Redis connection string                                  |
| `JWT_SECRET`                | *(required)*                     | HMAC signing secret — **must be ≥ 32 characters**        |
| `ACCESS_TOKEN_EXPIRY_SECONDS` | `900`                          | Access-token lifetime in seconds (15 min)                |
| `REFRESH_TOKEN_EXPIRY_DAYS` | `7`                              | Refresh-token lifetime in days                           |
| `S3_ENDPOINT`               | *(required)*                     | S3-compatible endpoint (MinIO: `http://localhost:9000`)  |
| `S3_ACCESS_KEY`             | *(required)*                     | S3 access key (MinIO dev: `minioadmin`)                  |
| `S3_SECRET_KEY`             | *(required)*                     | S3 secret key (MinIO dev: `minioadmin`)                  |
| `S3_BUCKET`                 | *(required)*                     | Bucket name (default `chat-media`, must be **public**)   |
| `S3_REGION`                 | `us-east-1`                      | S3 region (or `auto` for Cloudflare R2)                  |
| `CORS_ORIGIN`               | `http://localhost:3000`          | Comma-separated list of allowed frontend origins         |
| `PORT`                      | `8080`                           | HTTP listen port (auto-set by Railway)                   |
| `RUST_LOG`                  | `info`                           | Log level: `trace`, `debug`, `info`, `warn`, `error`     |

### Frontend (`frontend/.env.local`)

| Variable              | Example                 | Description                      |
|-----------------------|-------------------------|----------------------------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080` | Backend REST API base URL        |
| `NEXT_PUBLIC_WS_URL`  | `ws://localhost:8080`   | Backend WebSocket base URL       |

---

## Database Migrations

Migrations live in `backend/migrations/` and are managed by **sqlx-cli**.

```bash
cd backend
cargo sqlx migrate run      # apply pending migrations
cargo sqlx migrate revert   # revert the most recent one
cargo sqlx migrate add <description>   # create a new migration
```

**Offline mode (CI / Docker build without a live DB):** run `cargo sqlx prepare`
to generate the `backend/.sqlx/` metadata and commit it, then set
`SQLX_OFFLINE=true` in the build environment.

---

## API Reference

### REST Endpoints

| Method   | Path                                 | Auth | Description                                      |
|----------|--------------------------------------|------|--------------------------------------------------|
| `POST`   | `/api/auth/register`                 | No   | Register (email, password, display_name)         |
| `POST`   | `/api/auth/login`                    | No   | Login → access + refresh tokens                 |
| `POST`   | `/api/auth/refresh`                  | No   | Exchange refresh token for a new pair            |
| `POST`   | `/api/auth/logout`                   | Yes  | Revoke the refresh token                         |
| `GET`    | `/api/users/me`                      | Yes  | Current user profile                             |
| `PATCH`  | `/api/users/me`                      | Yes  | Update display_name / avatar_url / status        |
| `GET`    | `/api/users/:id`                     | Yes  | Public profile of a user                         |
| `GET`    | `/api/users/search?q=`               | Yes  | Search users by display name or email            |
| `GET`    | `/api/rooms`                         | Yes  | List rooms (enriched: members, last message)     |
| `POST`   | `/api/rooms`                         | Yes  | Create DM or group (DMs are deduplicated)        |
| `GET`    | `/api/rooms/:id`                     | Yes  | Room details (enriched)                          |
| `GET`    | `/api/rooms/:id/members`             | Yes  | List room members                                |
| `POST`   | `/api/rooms/:id/members`             | Yes  | Add a member (groups only)                       |
| `DELETE` | `/api/rooms/:id/members/:user_id`    | Yes  | Remove a member / leave a room                   |
| `GET`    | `/api/rooms/:id/messages`            | Yes  | Message history → `{ messages, next_cursor }`    |
| `POST`   | `/api/rooms/:id/messages`            | Yes  | Send text/image/video/audio/file message         |
| `PATCH`  | `/api/messages/:id`                  | Yes  | Edit a message                                   |
| `DELETE` | `/api/messages/:id`                  | Yes  | Soft-delete a message                            |
| `POST`   | `/api/messages/:id/read`             | Yes  | Mark read (triggers read receipt)                |
| `POST`   | `/api/media/presign`                 | Yes  | Presigned PUT URL for room media                 |
| `POST`   | `/api/media/presign-avatar`          | Yes  | Presigned PUT URL for a profile avatar           |
| `GET`    | `/api/ws`                            | Yes* | WebSocket upgrade (`?token=<jwt>`)               |
| `GET`    | `/health`                            | No   | Liveness probe → `{ "status": "ok" }`            |

\* The WebSocket authenticates via the `token` query parameter (JWT).

**Message shape** (used by `message.new` / `message.edited` and list responses):
`{ id, room_id, sender_id, content, content_type ("text"|"image"|"video"|"audio"|"file"),
reply_to_id, reply_to (preview), edited_at, deleted_at, created_at, sender (user),
read_by (user ids) }`.

**Room shape:** `{ id, name, is_group, created_by, created_at, members (with user profiles),
last_message, unread_count }`.

### WebSocket Events

Connect to `WS /api/ws?token=<access_jwt>`.

#### Server → client

| Event             | Payload fields                                        | Description                          |
|-------------------|-------------------------------------------------------|--------------------------------------|
| `message.new`     | full `Message` object                                 | New message in a room                |
| `message.edited`  | full `Message` object                                 | Message was edited                   |
| `message.deleted` | `{ id, room_id }`                                     | Message was soft-deleted             |
| `message.status`  | `{ message_id, user_id, status: "delivered"\|"read" }`| Read/delivered receipt               |
| `presence.update` | `{ user_id, online, last_seen }`                      | Presence change                      |
| `typing.start`    | `{ user_id, room_id }`                                | User started typing                  |
| `typing.stop`     | `{ user_id, room_id }`                                | User stopped typing                  |
| `call.offer`      | `{ caller_id, sdp, mode: "voice"\|"video" }`          | Incoming call offer                  |
| `call.answer`     | `{ callee_id, sdp }`                                  | Callee accepted                      |
| `call.ice`        | `{ user_id, candidate }`                              | WebRTC ICE candidate                 |
| `call.end`        | `{ user_id }`                                         | Call ended by the peer               |
| `call.decline`    | `{ user_id }`                                         | Incoming call was declined           |

#### Client → server

| Event            | Payload fields                                            | Description                        |
|------------------|-----------------------------------------------------------|------------------------------------|
| `presence.ping`  | *(none)*                                                  | Keep presence alive (sent ~30s)    |
| `typing.start`   | `{ room_id }`                                             | Notify others you're typing        |
| `typing.stop`    | `{ room_id }`                                             | Notify others you stopped typing   |
| `call.offer`     | `{ target_user_id, sdp, mode }`                           | Ring another user                  |
| `call.answer`    | `{ target_user_id, sdp }`                                 | Accept an incoming call            |
| `call.ice`       | `{ target_user_id, candidate }`                           | Send an ICE candidate              |
| `call.end`       | `{ target_user_id }`                                      | End/hang up the call               |
| `call.decline`   | `{ target_user_id }`                                      | Decline an incoming call           |

---

## Security Notes

### Token storage

- **Access tokens** (15 min) are stored in `localStorage` and sent as `Authorization: Bearer` headers. The client auto-refreshes 30s before expiry.
- **Refresh tokens** (7 days) live in an **HttpOnly** cookie set through the Next.js `app/api/auth/*` proxy routes, so they are never readable by JavaScript.
- Passwords are hashed with **Argon2**.

### Encryption status

The repo ships a `backend/src/crypto/` module (ChaCha20-Poly1305 AEAD + X25519 key exchange) as **prepared scaffolding**, but end-to-end encryption is **not active**: messages are stored and relayed in plaintext. Do not deploy this as-is with sensitive data.

### CORS

The backend only allows the origins listed in `CORS_ORIGIN` (comma-separated). **Do not** use `*` in production. Note `allow_credentials(true)` requires explicit methods/headers (not wildcards).

### Media

Object-storage buckets are public by design so the client can display media directly. Presigned **PUT** URLs are short-lived (5 minutes) and scoped to the caller's room (server verifies membership).

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

---

## License

This project is licensed under the **MIT License**. See [LICENSE](./LICENSE) for details.
