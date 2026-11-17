ALTER TABLE events
  ADD COLUMN photographer_limit integer CHECK (photographer_limit > 0),
  ADD COLUMN distances_km numeric[] NOT NULL DEFAULT '{}' CHECK (
    array_position(distances_km, NULL) IS NULL
    AND 0 < ALL(distances_km)
    AND 'Infinity'::numeric > ALL(distances_km)
  );

CREATE INDEX responses_confirmed_by_event_date
  ON responses (event_id, date_revision) WHERE available;
