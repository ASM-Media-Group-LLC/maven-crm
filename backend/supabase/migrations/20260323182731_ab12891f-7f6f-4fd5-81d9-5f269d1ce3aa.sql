-- Update trigger function to use 'Nuevo' stage instead of 'Pendiente LG'
CREATE OR REPLACE FUNCTION public.sync_closers_contact_to_creators()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.closer_creators (
    instagram_handle,
    source_account,
    category,
    phone,
    notes,
    stage,
    estimated_monetization,
    agency_commission,
    created_by
  ) VALUES (
    NEW.handle,
    NEW.company,
    NEW.physical_appearance,
    NEW.phone,
    NEW.notes,
    'Nuevo',
    0,
    0,
    NEW.created_by
  );
  RETURN NEW;
EXCEPTION WHEN unique_violation THEN
  RETURN NEW;
END;
$function$;

-- Fix existing records: contacts (no leadgen_entry_id) that were synced as 'Pendiente LG' → 'Nuevo'
UPDATE public.closer_creators
SET stage = 'Nuevo'
WHERE leadgen_entry_id IS NULL AND stage = 'Pendiente LG';