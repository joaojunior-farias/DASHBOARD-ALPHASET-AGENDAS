CREATE TABLE clients (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT ''
);
CREATE INDEX clients_name ON clients (lower(name));

ALTER TABLE calendar_events
  ADD COLUMN client_id uuid REFERENCES clients(id),
  ADD COLUMN end_date date,
  ADD COLUMN end_time text,
  ADD COLUMN all_day boolean NOT NULL DEFAULT false,
  ADD COLUMN series_id uuid;

UPDATE calendar_events SET end_date = date;
ALTER TABLE calendar_events
  ALTER COLUMN end_date SET NOT NULL,
  ADD CONSTRAINT calendar_events_date_range CHECK (end_date >= date),
  ADD CONSTRAINT calendar_events_end_time CHECK (
    end_time IS NULL OR (
      end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND (end_date > date OR end_time > time)
    )
  );
CREATE INDEX calendar_events_end_date ON calendar_events (end_date);
CREATE INDEX calendar_events_series ON calendar_events (series_id) WHERE series_id IS NOT NULL;
