-- 1. Clean up orphaned leadgen records (no real contact behind them)
DELETE FROM public.closer_creators
WHERE leadgen_entry_id IS NOT NULL
  AND source_contact_id IS NULL;

-- 2. Update sync trigger: only sync contacts that have a phone number
CREATE OR REPLACE FUNCTION public.sync_closers_contact_to_creators()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only sync if contact has a phone number
  IF NEW.phone IS NULL OR trim(NEW.phone) = '' THEN
    RETURN NEW;
  END IF;

  -- Skip if handle already exists in official creators table
  IF EXISTS (
    SELECT 1 FROM public.creators
    WHERE lower(trim(both '@' from instagram_handle)) = lower(trim(both '@' from NEW.handle))
  ) THEN
    RETURN NEW;
  END IF;

  -- Skip if already synced
  IF EXISTS (
    SELECT 1 FROM public.closer_creators WHERE source_contact_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.closer_creators (
    instagram_handle, source_account, category, phone, notes,
    stage, estimated_monetization, agency_commission, created_by, source_contact_id
  ) VALUES (
    NEW.handle, NEW.company, NEW.physical_appearance, NEW.phone, NEW.notes,
    'Nuevo', 0, 0, NEW.created_by, NEW.id
  );
  RETURN NEW;
EXCEPTION WHEN unique_violation THEN
  RETURN NEW;
END;
$function$;