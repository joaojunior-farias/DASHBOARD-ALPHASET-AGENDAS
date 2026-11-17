ALTER TABLE events ADD COLUMN has_been_published boolean NOT NULL DEFAULT false;
UPDATE events SET has_been_published = true WHERE published;

CREATE TABLE photographers (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_salt text NOT NULL,
  password_hash text NOT NULL
);

CREATE TABLE photographer_sessions (
  token_hash text PRIMARY KEY,
  photographer_id uuid NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX photographer_sessions_account_expiry ON photographer_sessions (photographer_id, expires_at);
