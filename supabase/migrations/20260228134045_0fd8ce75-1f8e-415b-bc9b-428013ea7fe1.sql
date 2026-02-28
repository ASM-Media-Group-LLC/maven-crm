ALTER TABLE public.custom_content_requests
  ADD COLUMN assigned_chatter_id UUID REFERENCES public.profiles(id),
  ADD COLUMN paid_amount NUMERIC;