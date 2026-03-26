-- ============================================================
-- recipe_ingredients
-- One row per ingredient line extracted from each batch xlsx.
-- Run this in the Supabase SQL editor once.
-- ============================================================

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id              bigserial     PRIMARY KEY,
  run_id          uuid          NOT NULL,
  file_name       text          NOT NULL,        -- e.g. Butter_Chicken_BATCH1_1800kg.xlsx
  item_code       text          NOT NULL,        -- safe_sheet_name or parent_wip for marinations
  file_type       text          NOT NULL CHECK (file_type IN ('recipe','marination')),
  batch_number    integer       NOT NULL,
  batch_size_kg   integer       NOT NULL,
  mix             text,                          -- col A (Mix)
  ingredient_code text,                          -- col B
  description     text,                          -- col C
  percentage      numeric(7,4),                  -- col E (%)
  new_batch_qty   numeric(12,3),                 -- col F (New Batch kg)
  created_at      timestamptz   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recipe_ingredients_run_id_idx
  ON recipe_ingredients (run_id);

CREATE INDEX IF NOT EXISTS recipe_ingredients_item_code_idx
  ON recipe_ingredients (item_code);
