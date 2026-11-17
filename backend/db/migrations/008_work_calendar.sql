CREATE TABLE calendar_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('category', 'modality', 'status', 'work_type')),
  name text NOT NULL,
  code text UNIQUE,
  parent_id uuid REFERENCES calendar_options(id),
  color text CHECK (color IN ('gray', 'blue', 'orange', 'green', 'purple', 'red')),
  card_sport text CHECK (card_sport IN ('Bike', 'Corrida', 'Trilha', 'Outro')),
  CHECK ((kind = 'modality') = (parent_id IS NOT NULL)),
  CHECK ((kind = 'status') = (color IS NOT NULL)),
  CHECK (card_sport IS NULL OR kind = 'modality')
);
CREATE UNIQUE INDEX calendar_options_unique_name ON calendar_options (
  kind, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)
);

INSERT INTO calendar_options (kind, name, code) VALUES
  ('category', 'Esportivo', 'sports'),
  ('category', 'Aniversário', 'birthday'),
  ('category', 'Ensaio', 'shoot'),
  ('category', 'Casamento', 'wedding'),
  ('category', 'Corporativo', 'corporate'),
  ('category', 'Freelance', 'freelance'),
  ('category', 'Outro', 'other'),
  ('work_type', 'Fotografia', 'photo'),
  ('work_type', 'Vídeo', NULL),
  ('work_type', 'Foto e vídeo', NULL),
  ('work_type', 'Drone', NULL),
  ('work_type', 'Edição', NULL);

INSERT INTO calendar_options (kind, name, code, color) VALUES
  ('status', 'Orçamento', 'quote', 'gray'),
  ('status', 'Em andamento', NULL, 'blue'),
  ('status', 'Aguardando confirmação', NULL, 'orange'),
  ('status', 'Confirmado', NULL, 'green'),
  ('status', 'Concluído', NULL, 'purple'),
  ('status', 'Cancelado', NULL, 'red');

INSERT INTO calendar_options (kind, name, parent_id, card_sport)
SELECT 'modality', presets.name, calendar_options.id, presets.card_sport
FROM (VALUES
  ('sports', 'MTB', 'Bike'), ('sports', 'Corrida', 'Corrida'), ('sports', 'Ciclismo', 'Bike'),
  ('sports', 'Trail run', 'Trilha'), ('sports', 'Treinão', NULL), ('sports', 'Patins', NULL), ('sports', 'HYROX', NULL),
  ('sports', 'Futebol', NULL), ('sports', 'CrossFit', NULL),
  ('birthday', 'Aniversário infantil', NULL), ('birthday', '15 anos', NULL), ('birthday', 'Aniversário adulto', NULL),
  ('shoot', 'Gestante', NULL), ('shoot', 'Newborn', NULL), ('shoot', 'Casal', NULL), ('shoot', 'Individual', NULL),
  ('shoot', 'Formatura', NULL), ('shoot', 'Estúdio', NULL),
  ('wedding', 'Pré-wedding', NULL), ('wedding', 'Civil', NULL), ('wedding', 'Religioso', NULL)
) AS presets(category_code, name, card_sport)
JOIN calendar_options ON calendar_options.code = presets.category_code;

CREATE TABLE calendar_events (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  client_name text NOT NULL DEFAULT '',
  date date NOT NULL,
  time text NOT NULL CHECK (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  location text NOT NULL DEFAULT '',
  category_id uuid NOT NULL REFERENCES calendar_options(id),
  modality_id uuid REFERENCES calendar_options(id),
  status_id uuid NOT NULL REFERENCES calendar_options(id),
  work_type_id uuid NOT NULL REFERENCES calendar_options(id),
  distances_km numeric[] NOT NULL DEFAULT '{}' CHECK (
    array_position(distances_km, NULL) IS NULL
    AND 0 < ALL(distances_km)
    AND 'Infinity'::numeric > ALL(distances_km)
  ),
  version integer NOT NULL DEFAULT 1
);
CREATE INDEX calendar_events_date_time ON calendar_events (date, time);

ALTER TABLE events ADD COLUMN calendar_event_id uuid UNIQUE REFERENCES calendar_events(id);
