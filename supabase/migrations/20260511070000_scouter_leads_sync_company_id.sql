-- Sincronización automática de company_id ← primer slug de target_companies.
-- Así el user solo edita target_companies desde el popup y el FK queda
-- alineado automáticamente, sin tener que tocar dos campos.
--
-- Si el sync crearía conflicto en la unique constraint
-- (company_id, instagram_handle) — porque ya hay otro lead con ese par —,
-- dejamos company_id como está. El filtro de UI ya hace OR contra
-- target_companies, así que el routing funciona igual.

CREATE OR REPLACE FUNCTION public.tg_scouter_lead_sync_company_id()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_first_slug text;
  v_new_company_id uuid;
  v_conflict_exists boolean;
BEGIN
  IF NEW.target_companies IS NULL OR jsonb_typeof(NEW.target_companies) <> 'array' THEN
    RETURN NEW;
  END IF;
  IF jsonb_array_length(NEW.target_companies) = 0 THEN
    RETURN NEW;
  END IF;

  v_first_slug := NEW.target_companies->>0;
  IF v_first_slug IS NULL OR v_first_slug = '' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_new_company_id
  FROM public.scouter_companies
  WHERE slug = v_first_slug;

  IF v_new_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id = v_new_company_id THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.scouter_leads
    WHERE company_id = v_new_company_id
      AND LOWER(instagram_handle) = LOWER(NEW.instagram_handle)
      AND id <> NEW.id
  ) INTO v_conflict_exists;

  IF v_conflict_exists THEN
    RETURN NEW;
  END IF;

  NEW.company_id := v_new_company_id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_scouter_lead_sync_company_id ON public.scouter_leads;
CREATE TRIGGER trg_scouter_lead_sync_company_id
  BEFORE INSERT OR UPDATE OF target_companies ON public.scouter_leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_scouter_lead_sync_company_id();

-- Backfill: dispara el trigger para todos los leads con target_companies
-- no vacío. Postgres aplica el trigger fila por fila — si hay conflicto
-- de unique constraint en alguna, la guard del trigger lo skipea.
UPDATE public.scouter_leads
SET target_companies = target_companies
WHERE target_companies IS NOT NULL
  AND jsonb_typeof(target_companies) = 'array'
  AND jsonb_array_length(target_companies) > 0;
