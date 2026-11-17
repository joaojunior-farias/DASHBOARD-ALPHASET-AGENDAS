ALTER TABLE events
  ADD COLUMN closed boolean NOT NULL DEFAULT false,
  ADD CHECK (NOT closed OR NOT published);

CREATE TABLE manual_photographer_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  date_revision integer NOT NULL,
  name text NOT NULL
);
CREATE UNIQUE INDEX manual_photographer_assignment_name
  ON manual_photographer_assignments (event_id, date_revision, lower(name));

ALTER TABLE responses
  ADD COLUMN assigned_by_admin boolean NOT NULL DEFAULT false,
  DROP CONSTRAINT responses_check,
  ADD CONSTRAINT responses_selection_check CHECK (
    selection IS NULL OR (selection IN ('confirmed', 'declined') AND (available OR assigned_by_admin))
  );

ALTER TABLE dashboard_users
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN password_version integer NOT NULL DEFAULT 1;
ALTER TABLE photographers ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;

CREATE TABLE dashboard_profiles (
  subject text PRIMARY KEY,
  display_name text NOT NULL,
  avatar text
);
