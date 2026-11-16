CREATE TABLE dashboard_users (
  id uuid PRIMARY KEY,
  username_key text NOT NULL UNIQUE,
  password_salt text NOT NULL,
  password_hash text NOT NULL
);
