
-- Step 1: Deduplicate closer_creators rows for contacts (keep oldest per handle)
DELETE FROM public.closer_creators a
USING public.closer_creators b
WHERE a.leadgen_entry_id IS NULL
  AND b.leadgen_entry_id IS NULL
  AND lower(trim(both '@' from a.instagram_handle)) = lower(trim(both '@' from b.instagram_handle))
  AND a.id > b.id;

-- Step 2: Delete Nuevo rows where creator already exists
DELETE FROM public.closer_creators cc
USING public.creators cr
WHERE cc.stage = 'Nuevo'
  AND cc.leadgen_entry_id IS NULL
  AND lower(trim(both '@' from cc.instagram_handle)) = lower(trim(both '@' from cr.instagram_handle));

-- Step 3: Add column
ALTER TABLE public.closer_creators
  ADD COLUMN source_contact_id uuid UNIQUE REFERENCES public.closers_contacts(id);

-- Step 4: Backfill
UPDATE public.closer_creators cc
SET source_contact_id = sub.contact_id
FROM (
  SELECT DISTINCT ON (lower(trim(both '@' from sc.handle)))
    cc2.id as cc_id, sc.id as contact_id
  FROM public.closer_creators cc2
  JOIN public.closers_contacts sc
    ON lower(trim(both '@' from cc2.instagram_handle)) = lower(trim(both '@' from sc.handle))
  WHERE cc2.leadgen_entry_id IS NULL
    AND cc2.source_contact_id IS NULL
  ORDER BY lower(trim(both '@' from sc.handle)), sc.created_at DESC
) sub
WHERE cc.id = sub.cc_id;

-- Step 5: Replace sync trigger
CREATE OR REPLACE FUNCTION public.sync_closers_contact_to_creators()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.creators
    WHERE lower(trim(both '@' from instagram_handle)) = lower(trim(both '@' from NEW.handle))
  ) THEN
    RETURN NEW;
  END IF;

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

-- Step 6: UPDATE sync
CREATE OR REPLACE FUNCTION public.sync_closers_contact_update()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.closer_creators
  SET instagram_handle = NEW.handle, source_account = NEW.company,
      category = NEW.physical_appearance, phone = NEW.phone, notes = NEW.notes
  WHERE source_contact_id = NEW.id AND stage = 'Nuevo';
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_closers_contact_update ON public.closers_contacts;
CREATE TRIGGER trg_sync_closers_contact_update
  AFTER UPDATE ON public.closers_contacts
  FOR EACH ROW EXECUTE FUNCTION public.sync_closers_contact_update();

-- Step 7: Cleanup on creator insert
CREATE OR REPLACE FUNCTION public.cleanup_closer_on_creator_insert()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.closers_contacts SET status = 'converted'
  WHERE lower(trim(both '@' from handle)) = lower(trim(both '@' from NEW.instagram_handle))
    AND status IS DISTINCT FROM 'converted';

  DELETE FROM public.closer_creators
  WHERE stage = 'Nuevo' AND leadgen_entry_id IS NULL
    AND lower(trim(both '@' from instagram_handle)) = lower(trim(both '@' from NEW.instagram_handle));

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_cleanup_closer_on_creator_insert ON public.creators;
CREATE TRIGGER trg_cleanup_closer_on_creator_insert
  AFTER INSERT ON public.creators
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_closer_on_creator_insert();
