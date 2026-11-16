ALTER TABLE events ADD COLUMN date_revision integer NOT NULL DEFAULT 1;
ALTER TABLE responses ADD COLUMN date_revision integer NOT NULL DEFAULT 1;
