ALTER TABLE events
  ADD COLUMN meeting_time text CHECK (meeting_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD COLUMN published boolean NOT NULL DEFAULT true;

ALTER TABLE events ALTER COLUMN published SET DEFAULT false;
