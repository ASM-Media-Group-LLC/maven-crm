-- Function to sync closers_contacts inserts to closer_creators
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
    'Pendiente LG',
    0,
    0,
    NEW.created_by
  );
  RETURN NEW;
EXCEPTION WHEN unique_violation THEN
  RETURN NEW;
END;
$function$;

-- Trigger on closers_contacts
CREATE TRIGGER trg_sync_closers_contact_to_creators
  AFTER INSERT ON public.closers_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_closers_contact_to_creators();

-- Backfill existing closers_contacts that don't have a corresponding closer_creators record
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
)
SELECT
  cc.handle,
  cc.company,
  cc.physical_appearance,
  cc.phone,
  cc.notes,
  'Pendiente LG',
  0,
  0,
  CASE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = cc.created_by::uuid) THEN cc.created_by ELSE NULL END
FROM public.closers_contacts cc
WHERE NOT EXISTS (
  SELECT 1 FROM public.closer_creators cr
  WHERE LOWER(cr.instagram_handle) = LOWER(cc.handle)
)
ON CONFLICT DO NOTHING;