-- migration 002: rooms + room_members tables
CREATE TABLE IF NOT EXISTS rooms (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT,
  is_group    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_by  UUID         NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_members (
  room_id    UUID         NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT         NOT NULL DEFAULT 'member',  -- 'admin' | 'member'
  joined_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS room_members_user_id_idx ON room_members (user_id);
