-- Drop the old LeadGen→Closers trigger that creates "Pendiente LG" entries
DROP TRIGGER IF EXISTS trg_auto_sync_leadgen_to_closers ON public.leadgen_entries;
DROP FUNCTION IF EXISTS public.auto_sync_leadgen_to_closers();