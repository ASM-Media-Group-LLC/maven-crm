-- ─── Métrica "primera captura de teléfono" ──────────────────────────────
--
-- Para el dashboard de Panel de Control la card "Números obtenidos" tiene
-- que contar SOLO la primera vez que se le agrega un teléfono a una
-- modelo. No se cuenta:
--   • Editar un teléfono existente (typo fix, formato).
--   • Borrar el teléfono y volver a cargarlo después.
--
-- El esquema actual (`leadgen_entries.phone_e164` / `scouter_leads.phone`)
-- guarda solo el valor actual — no hay forma de saber "cuándo entró por
-- primera vez". Esta migración agrega esa info:
--
--   1. Columna `phone_first_set_at timestamptz` en ambas tablas (NULL
--      hasta la primera captura).
--   2. Trigger que la setea SOLO cuando phone pasa de NULL→no-NULL Y la
--      columna `_first_set_at` aún es NULL — idempotente: jamás se
--      sobrescribe (delete-then-readd no recapta).
--   3. Backfill: para filas que ya tienen phone hoy, copiamos
--      `created_at` como aproximación (perdemos el evento exacto pero
--      es lo mejor que podemos hacer con los datos actuales).
--
-- Después de aplicar esto, hay que cambiar el hook
-- `useOperationsDashboard.ts` para que `numbersObtained` filtre por
-- `phone_first_set_at` en el rango (en lugar de `created_at` +
-- phone IS NOT NULL).

-- ── leadgen_entries ──────────────────────────────────────────────────
ALTER TABLE public.leadgen_entries
  ADD COLUMN IF NOT EXISTS phone_first_set_at timestamptz;

CREATE INDEX IF NOT EXISTS leadgen_entries_phone_first_set_idx
  ON public.leadgen_entries (phone_first_set_at)
  WHERE phone_first_set_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_leadgen_phone_first_set()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- INSERT con phone ya seteado
  IF TG_OP = 'INSERT' THEN
    IF NEW.phone_e164 IS NOT NULL AND NEW.phone_first_set_at IS NULL THEN
      NEW.phone_first_set_at := NOW();
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: solo capturar la primera transición NULL→no-NULL.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.phone_e164 IS NULL
       AND NEW.phone_e164 IS NOT NULL
       AND NEW.phone_first_set_at IS NULL THEN
      NEW.phone_first_set_at := NOW();
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leadgen_phone_first_set ON public.leadgen_entries;
CREATE TRIGGER trg_leadgen_phone_first_set
  BEFORE INSERT OR UPDATE OF phone_e164 ON public.leadgen_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_leadgen_phone_first_set();

-- Backfill — solo para filas que ya tienen phone hoy y first_set_at NULL.
UPDATE public.leadgen_entries
SET phone_first_set_at = created_at
WHERE phone_e164 IS NOT NULL
  AND phone_first_set_at IS NULL;

-- ── scouter_leads ────────────────────────────────────────────────────
ALTER TABLE public.scouter_leads
  ADD COLUMN IF NOT EXISTS phone_first_set_at timestamptz;

CREATE INDEX IF NOT EXISTS scouter_leads_phone_first_set_idx
  ON public.scouter_leads (phone_first_set_at)
  WHERE phone_first_set_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_scouter_phone_first_set()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.phone IS NOT NULL AND NEW.phone_first_set_at IS NULL THEN
      NEW.phone_first_set_at := NOW();
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.phone IS NULL
       AND NEW.phone IS NOT NULL
       AND NEW.phone_first_set_at IS NULL THEN
      NEW.phone_first_set_at := NOW();
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scouter_phone_first_set ON public.scouter_leads;
CREATE TRIGGER trg_scouter_phone_first_set
  BEFORE INSERT OR UPDATE OF phone ON public.scouter_leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_scouter_phone_first_set();

UPDATE public.scouter_leads
SET phone_first_set_at = created_at
WHERE phone IS NOT NULL
  AND phone_first_set_at IS NULL;
