-- migration 003: messages + message_reads tables
CREATE TABLE IF NOT EXISTS messages (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       UUID         NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_id     UUID         NOT NULL REFERENCES users(id),
  content       TEXT         NOT NULL,
  content_type  TEXT         NOT NULL DEFAULT 'text',  -- 'text'|'image'|'file'|'audio'
  reply_to_id   UUID         REFERENCES messages(id),
  edited_at     TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_room_created ON messages (room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS message_reads (
  message_id  UUID         NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);
