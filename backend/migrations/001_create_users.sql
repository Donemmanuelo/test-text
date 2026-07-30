-- migration 001: users table
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT         UNIQUE NOT NULL,
  display_name    TEXT         NOT NULL,
  avatar_url      TEXT,
  status_message  TEXT,
  password_hash   TEXT         NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);
