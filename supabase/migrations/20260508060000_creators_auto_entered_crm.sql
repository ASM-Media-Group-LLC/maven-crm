-- ─── Auto-poblar entered_crm_at desde el onboarding ───────────────────
--
-- "Ingresada al CRM" = la modelo ya pasó (al menos parcialmente) por el
-- onboarding wizard. En la práctica eso es:
--   creators.status NOT IN ('borrador')
--
-- 'borrador' es el estado de auto-save mientras el closer llena el
-- wizard pero sin enviar. Cuando finaliza, status pasa a
-- 'pendiente_verificacion' (o a 'active' si lo aprueban directo, etc.).
--
-- Este trigger setea `entered_crm_at = NOW()` la PRIMERA VEZ que status
-- deja de ser 'borrador' (en INSERT directo o en UPDATE). Es idempotente:
-- si la columna ya tiene valor, nunca se sobrescribe — soporta el
-- toggle manual previo y rebote borrador/no-borrador sin cambiar la
-- fecha original.
--
-- También backfill: todas las creators existentes que NO están en
-- borrador y aún no tienen entered_crm_at, lo reciben = created_at.

CREATE OR REPLACE FUNCTION public.tg_creator_auto_entered_crm()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Inserts directos con status no-borrador: cuenta como ingresada.
    IF (NEW.status IS DISTINCT FROM 'borrador')
       AND NEW.entered_crm_at IS NULL THEN
      NEW.entered_crm_at := NOW();
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Solo capturar la primera transición borrador → no-borrador.
    IF OLD.status IS NOT DISTINCT FROM 'borrador'
       AND NEW.status IS DISTINCT FROM 'borrador'
       AND NEW.entered_crm_at IS NULL THEN
      NEW.entered_crm_at := NOW();
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_creator_auto_entered_crm ON public.creators;
CREATE TRIGGER trg_creator_auto_entered_crm
  BEFORE INSERT OR UPDATE OF status ON public.creators
  FOR EACH ROW EXECUTE FUNCTION public.tg_creator_auto_entered_crm();

-- Backfill: creators existentes NO en borrador con entered_crm_at NULL
-- reciben created_at como aproximación. Las que ya tenían entered_crm_at
-- (toggle manual previo) NO se tocan.
UPDATE public.creators
SET entered_crm_at = created_at
WHERE status IS DISTINCT FROM 'borrador'
  AND entered_crm_at IS NULL;
