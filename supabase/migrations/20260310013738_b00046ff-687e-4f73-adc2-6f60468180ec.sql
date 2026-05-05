CREATE UNIQUE INDEX IF NOT EXISTS uq_leadgen_handle_platform 
ON public.leadgen_entries (LOWER(model_handle), platform)
WHERE model_handle IS NOT NULL AND model_handle != '';