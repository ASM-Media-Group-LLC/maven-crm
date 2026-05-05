ALTER TABLE public.custom_content_requests
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'normal';