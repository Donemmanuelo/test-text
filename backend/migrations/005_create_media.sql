-- migration 005: media table
CREATE TABLE IF NOT EXISTS media (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       UUID         NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  uploader_id   UUID         NOT NULL REFERENCES users(id),
  filename      TEXT         NOT NULL,
  content_type  TEXT         NOT NULL,
  s3_key        TEXT         NOT NULL,
  file_url      TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS media_room_id_idx ON media (room_id);
CREATE INDEX IF NOT EXISTS media_uploader_idx ON media (uploader_id);
