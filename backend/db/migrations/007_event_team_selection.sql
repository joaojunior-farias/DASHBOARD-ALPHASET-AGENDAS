ALTER TABLE responses
  ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  ADD COLUMN selection text CHECK (selection IS NULL OR (selection IN ('confirmed', 'declined') AND available));
