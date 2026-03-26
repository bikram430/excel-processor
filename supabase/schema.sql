-- ============================================================
-- Full database schema — run once in Supabase SQL editor.
-- ============================================================

-- ── 1. runs ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runs (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  status        text          NOT NULL DEFAULT 'queued'
                              CHECK (status IN ('queued','running','done','error')),
  notes         text,
  error_message text,
  created_at    timestamptz   DEFAULT now(),
  updated_at    timestamptz   DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS runs_updated_at ON runs;
CREATE TRIGGER runs_updated_at
  BEFORE UPDATE ON runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Allow frontend (anon key) to read runs
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon can read runs" ON runs;
CREATE POLICY "anon can read runs" ON runs
  FOR SELECT TO anon USING (true);

-- ── 2. recipe_files ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipe_files (
  id            bigserial     PRIMARY KEY,
  run_id        uuid          NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  file_name     text          NOT NULL,
  storage_path  text          NOT NULL,
  item_code     text          NOT NULL,
  file_type     text          NOT NULL CHECK (file_type IN ('recipe','marination')),
  batch_number  integer       NOT NULL,
  batch_size_kg integer       NOT NULL,
  created_at    timestamptz   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recipe_files_run_id_idx   ON recipe_files (run_id);
CREATE INDEX IF NOT EXISTS recipe_files_item_code_idx ON recipe_files (item_code);

-- Allow frontend (anon key) to read recipe files
ALTER TABLE recipe_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon can read recipe_files" ON recipe_files;
CREATE POLICY "anon can read recipe_files" ON recipe_files
  FOR SELECT TO anon USING (true);

-- ── 3. recipe_ingredients ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id              bigserial     PRIMARY KEY,
  run_id          uuid          NOT NULL,
  file_name       text          NOT NULL,
  item_code       text          NOT NULL,
  file_type       text          NOT NULL CHECK (file_type IN ('recipe','marination')),
  batch_number    integer       NOT NULL,
  batch_size_kg   integer       NOT NULL,
  mix             text,
  ingredient_code text,
  description     text,
  percentage      numeric(7,4),
  new_batch_qty   numeric(12,3),
  created_at      timestamptz   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recipe_ingredients_run_id_idx
  ON recipe_ingredients (run_id);
CREATE INDEX IF NOT EXISTS recipe_ingredients_item_code_idx
  ON recipe_ingredients (item_code);

-- Allow frontend (anon key) to read ingredients
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon can read recipe_ingredients" ON recipe_ingredients;
CREATE POLICY "anon can read recipe_ingredients" ON recipe_ingredients
  FOR SELECT TO anon USING (true);
