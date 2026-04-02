ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS commission_snapshot jsonb DEFAULT NULL;