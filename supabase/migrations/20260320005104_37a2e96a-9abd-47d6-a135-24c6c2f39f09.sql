-- Delete remaining @m_* test records from Oct 2025
DELETE FROM public.leadgen_entries
WHERE model_handle LIKE '@m\_%' ESCAPE '\' AND entry_date < '2025-11-01';

-- Delete records with fake UUID pattern 20000014-*
DELETE FROM public.leadgen_entries
WHERE lg_user_id::text LIKE '20000014-%';
