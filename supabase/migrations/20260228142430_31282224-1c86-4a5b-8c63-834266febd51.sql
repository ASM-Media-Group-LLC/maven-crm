ALTER TABLE public.custom_content_requests
  ADD COLUMN IF NOT EXISTS request_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS fan_username TEXT,
  ADD COLUMN IF NOT EXISTS fan_spent_amount NUMERIC;