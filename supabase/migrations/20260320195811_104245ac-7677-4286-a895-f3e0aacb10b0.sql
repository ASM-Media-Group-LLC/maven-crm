CREATE OR REPLACE FUNCTION public.auto_sync_leadgen_to_closers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.closer_creators (
    instagram_handle,
    source_account,
    category,
    phone,
    onlyfans_url,
    passed_date,
    stage,
    estimated_monetization,
    agency_commission,
    created_by,
    leadgen_entry_id
  ) VALUES (
    NEW.model_handle,
    NEW.company,
    NEW.quality,
    NEW.phone_raw,
    NEW.source_link,
    NEW.entry_date,
    'Pendiente LG',
    0,
    0,
    NEW.lg_user_id,
    NEW.id
  );
  RETURN NEW;
EXCEPTION WHEN unique_violation THEN
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_sync_leadgen_to_closers
AFTER INSERT ON public.leadgen_entries
FOR EACH ROW
EXECUTE FUNCTION public.auto_sync_leadgen_to_closers();