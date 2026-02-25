ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS cost_center text,
  ADD COLUMN IF NOT EXISTS hour_bank_enabled boolean DEFAULT false;