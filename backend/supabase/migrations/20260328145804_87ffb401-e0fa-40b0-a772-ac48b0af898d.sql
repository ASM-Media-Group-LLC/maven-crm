ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS agency_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blue_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paypal_amount numeric DEFAULT 0;