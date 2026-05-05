-- Drop the trigger that auto-syncs leadgen entries to closer_creators
DROP TRIGGER IF EXISTS trg_auto_sync_leadgen ON public.leadgen_entries;

-- Update existing "Pendiente LG" records to "Nuevo" so they enter the normal pipeline
UPDATE public.closer_creators
SET stage = 'Nuevo'
WHERE stage = 'Pendiente LG';