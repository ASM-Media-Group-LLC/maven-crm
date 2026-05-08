-- ─── Phase 1: unified phone capture tracking ──────────────────────────
--
-- Objetivo: que el dashboard "Números obtenidos" pueda contar capturas
-- de teléfono sin importar en qué tabla las guardó la UI, y sin doble
-- conteo cuando una misma modelo aparece en varias etapas
-- (leadgen → contactos → closer_creators → creators).
--
-- Estrategia:
--   1. Agregar `phone_first_set_at` + trigger BEFORE INSERT/UPDATE OF
--      phone a las 3 tablas que faltan (closer_creators, closers_contacts,
--      creators). leadgen_entries y scouter_leads ya tienen el patrón.
--   2. Backfill `phone_first_set_at = created_at` para filas con phone
--      hoy (mejor aproximación).
--   3. Crear view `v_model_phone_captures` que UNIONa las 5 fuentes y
--      DEDUPEA por (handle, phone) para colapsar las 802 capturas de
--      "misma modelo en distintas etapas" en una sola entrada.
--
-- El dashboard cambia su query a leer de la view. Resultado: una
-- captura por (modelo, número), con fecha = primera vez que cualquier
-- equipo registró el número.

-- ── 1. closer_creators ──────────────────────────────────────────────
ALTER TABLE public.closer_creators
  ADD COLUMN IF NOT EXISTS phone_first_set_at timestamptz;

CREATE INDEX IF NOT EXISTS closer_creators_phone_first_set_idx
  ON public.closer_creators (phone_first_set_at)
  WHERE phone_first_set_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_closer_creator_phone_first_set()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.phone IS NOT NULL AND NEW.phone <> ''
       AND NEW.phone_first_set_at IS NULL THEN
      NEW.phone_first_set_at := NOW();
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.phone IS NULL OR OLD.phone = '')
       AND NEW.phone IS NOT NULL AND NEW.phone <> ''
       AND NEW.phone_first_set_at IS NULL THEN
      NEW.phone_first_set_at := NOW();
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_closer_creator_phone_first_set ON public.closer_creators;
CREATE TRIGGER trg_closer_creator_phone_first_set
  BEFORE INSERT OR UPDATE OF phone ON public.closer_creators
  FOR EACH ROW EXECUTE FUNCTION public.tg_closer_creator_phone_first_set();

UPDATE public.closer_creators
SET phone_first_set_at = created_at
WHERE phone IS NOT NULL AND phone <> ''
  AND phone_first_set_at IS NULL;

-- ── 2. closers_contacts ─────────────────────────────────────────────
ALTER TABLE public.closers_contacts
  ADD COLUMN IF NOT EXISTS phone_first_set_at timestamptz;

CREATE INDEX IF NOT EXISTS closers_contacts_phone_first_set_idx
  ON public.closers_contacts (phone_first_set_at)
  WHERE phone_first_set_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_closers_contact_phone_first_set()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.phone IS NOT NULL AND NEW.phone <> ''
       AND NEW.phone_first_set_at IS NULL THEN
      NEW.phone_first_set_at := NOW();
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.phone IS NULL OR OLD.phone = '')
       AND NEW.phone IS NOT NULL AND NEW.phone <> ''
       AND NEW.phone_first_set_at IS NULL THEN
      NEW.phone_first_set_at := NOW();
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_closers_contact_phone_first_set ON public.closers_contacts;
CREATE TRIGGER trg_closers_contact_phone_first_set
  BEFORE INSERT OR UPDATE OF phone ON public.closers_contacts
  FOR EACH ROW EXECUTE FUNCTION public.tg_closers_contact_phone_first_set();

UPDATE public.closers_contacts
SET phone_first_set_at = created_at
WHERE phone IS NOT NULL AND phone <> ''
  AND phone_first_set_at IS NULL;

-- ── 3. creators ─────────────────────────────────────────────────────
-- creators tiene `phone` y `phone_e164`. El trigger watch sólo `phone`
-- (la columna que viene del input directo). phone_e164 es la versión
-- normalizada y se actualiza por la misma UI.
ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS phone_first_set_at timestamptz;

CREATE INDEX IF NOT EXISTS creators_phone_first_set_idx
  ON public.creators (phone_first_set_at)
  WHERE phone_first_set_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_creator_phone_first_set()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.phone IS NOT NULL AND NEW.phone <> ''
       AND NEW.phone_first_set_at IS NULL THEN
      NEW.phone_first_set_at := NOW();
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.phone IS NULL OR OLD.phone = '')
       AND NEW.phone IS NOT NULL AND NEW.phone <> ''
       AND NEW.phone_first_set_at IS NULL THEN
      NEW.phone_first_set_at := NOW();
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_creator_phone_first_set ON public.creators;
CREATE TRIGGER trg_creator_phone_first_set
  BEFORE INSERT OR UPDATE OF phone ON public.creators
  FOR EACH ROW EXECUTE FUNCTION public.tg_creator_phone_first_set();

UPDATE public.creators
SET phone_first_set_at = created_at
WHERE phone IS NOT NULL AND phone <> ''
  AND phone_first_set_at IS NULL;

-- ── 4. View consolidada `v_model_phone_captures` ───────────────────
-- UNIONa las 5 fuentes y DEDUPEA por (handle, phone) → keep el primer
-- captured_at. Esto colapsa los 802 same-handle dupes en una sola
-- entrada. Los 73 sospechosos (mismo phone, distintos handles) NO se
-- colapsan — quedan como entradas separadas, y el dashboard las cuenta
-- como capturas distintas (lo cual es correcto: son modelos distintas
-- que dijeron tener el mismo número, y el data quality fix es manual).
CREATE OR REPLACE VIEW public.v_model_phone_captures AS
WITH all_captures AS (
  SELECT 'leadgen_entries'::text AS source_table, id::text AS source_id,
         LOWER(COALESCE(model_handle, '')) AS handle,
         regexp_replace(COALESCE(phone_e164, ''), '[^0-9+]', '', 'g') AS phone_norm,
         phone_e164 AS phone,
         phone_first_set_at AS captured_at
  FROM public.leadgen_entries
  WHERE phone_first_set_at IS NOT NULL
  UNION ALL
  SELECT 'scouter_leads', id::text, LOWER(COALESCE(instagram_handle, '')),
         regexp_replace(COALESCE(phone, ''), '[^0-9+]', '', 'g'),
         phone, phone_first_set_at
  FROM public.scouter_leads
  WHERE phone_first_set_at IS NOT NULL
  UNION ALL
  SELECT 'closer_creators', id::text, LOWER(COALESCE(instagram_handle, '')),
         regexp_replace(COALESCE(phone, ''), '[^0-9+]', '', 'g'),
         phone, phone_first_set_at
  FROM public.closer_creators
  WHERE phone_first_set_at IS NOT NULL
  UNION ALL
  SELECT 'closers_contacts', id::text, LOWER(COALESCE(handle, '')),
         regexp_replace(COALESCE(phone, ''), '[^0-9+]', '', 'g'),
         phone, phone_first_set_at
  FROM public.closers_contacts
  WHERE phone_first_set_at IS NOT NULL
  UNION ALL
  SELECT 'creators', id::text, LOWER(COALESCE(instagram_handle, '')),
         regexp_replace(COALESCE(phone, ''), '[^0-9+]', '', 'g'),
         phone, phone_first_set_at
  FROM public.creators
  WHERE phone_first_set_at IS NOT NULL
)
SELECT DISTINCT ON (handle, phone_norm)
  source_table, source_id, handle, phone, phone_norm, captured_at
FROM all_captures
WHERE phone_norm <> ''
ORDER BY handle, phone_norm, captured_at ASC;

COMMENT ON VIEW public.v_model_phone_captures IS
  'Capturas de teléfono únicas por (modelo, número) cross-table. Una entrada por modelo+phone, con la fecha de la primera captura. Usar para el dashboard "Números obtenidos".';

GRANT SELECT ON public.v_model_phone_captures TO authenticated;
