INSERT INTO public.closer_creators (
  instagram_handle, source_account, category, phone,
  onlyfans_url, passed_date, stage,
  estimated_monetization, agency_commission,
  created_by, leadgen_entry_id
)
SELECT
  le.model_handle,
  le.company,
  le.quality,
  le.phone_raw,
  le.source_link,
  le.entry_date,
  'Pendiente LG',
  0, 0,
  CASE WHEN au.id IS NOT NULL THEN le.lg_user_id ELSE NULL END,
  le.id
FROM public.leadgen_entries le
LEFT JOIN auth.users au ON au.id = le.lg_user_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.closer_creators cc
  WHERE cc.leadgen_entry_id = le.id
);