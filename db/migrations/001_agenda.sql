CREATE TABLE events (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  date date NOT NULL,
  time text NOT NULL CHECK (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  period text NOT NULL CHECK (period IN ('Manhã', 'Tarde', 'Noite')),
  sport text NOT NULL CHECK (sport IN ('Bike', 'Corrida', 'Trilha', 'Outro')),
  location text
);

CREATE INDEX events_date_time ON events (date, time);

CREATE TABLE responses (
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL,
  name text NOT NULL,
  available boolean NOT NULL,
  PRIMARY KEY (event_id, participant_id)
);

CREATE TABLE settings (
  key text PRIMARY KEY,
  value text NOT NULL
);
