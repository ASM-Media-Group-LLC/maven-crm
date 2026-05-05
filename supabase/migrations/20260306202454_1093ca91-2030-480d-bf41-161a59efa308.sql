ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_notes text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS has_commission boolean DEFAULT false;