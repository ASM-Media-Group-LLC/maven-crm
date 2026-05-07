-- Cleanup de orphan refs para poder agregar los FKs naturales que la
-- migration anterior (20260507160000_isolate_legacy_tables.sql) tuvo
-- que skipear porque rompían con violations.
--
-- Estrategia por columna:
--   1. Si es NOT NULL pero la columna es legacy/optional, DROP NOT NULL.
--   2. NULLify rows que apuntan a parents borrados (orphans).
--   3. ADD FK ... ON DELETE SET NULL (para no perder data en futuro).
--   4. Index si no existe (idx_<tabla>_<col>).

-- ─── leadgen_entries.lg_user_id ──────────────────────────────────────────
-- Auth user que ingresó el lead. NOT NULL legacy — no hay razón real
-- para forzarlo si el user puede haberse ido. Bajamos NOT NULL.

ALTER TABLE public.leadgen_entries
  ALTER COLUMN lg_user_id DROP NOT NULL;

UPDATE public.leadgen_entries
SET lg_user_id = NULL
WHERE lg_user_id IS NOT NULL
  AND lg_user_id NOT IN (SELECT id FROM auth.users);

ALTER TABLE public.leadgen_entries
  ADD CONSTRAINT leadgen_entries_lg_user_id_fkey
    FOREIGN KEY (lg_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leadgen_entries_lg_user_id
  ON public.leadgen_entries(lg_user_id) WHERE lg_user_id IS NOT NULL;


-- ─── leadgen_entries.created_creator_id ──────────────────────────────────
-- Creator generado a partir del lead (cuando se cerró). Ya es nullable.

UPDATE public.leadgen_entries
SET created_creator_id = NULL
WHERE created_creator_id IS NOT NULL
  AND created_creator_id NOT IN (SELECT id FROM public.creators);

ALTER TABLE public.leadgen_entries
  ADD CONSTRAINT leadgen_entries_created_creator_id_fkey
    FOREIGN KEY (created_creator_id) REFERENCES public.creators(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leadgen_entries_created_creator_id
  ON public.leadgen_entries(created_creator_id) WHERE created_creator_id IS NOT NULL;


-- ─── promolog_entries.creator_id ─────────────────────────────────────────
-- Creator dueño del log. Si es NOT NULL en schema, lo dejamos así
-- (un promolog sin creator no tiene sentido). Pero NULLificamos
-- orphans antes de agregar el FK con ON DELETE CASCADE.
-- Si hay orphans con NOT NULL, esos rows hay que borrarlos.

DELETE FROM public.promolog_entries
WHERE creator_id IS NOT NULL
  AND creator_id NOT IN (SELECT id FROM public.creators);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.promolog_entries'::regclass
      AND conname = 'promolog_entries_creator_id_fkey'
  ) THEN
    ALTER TABLE public.promolog_entries
      ADD CONSTRAINT promolog_entries_creator_id_fkey
        FOREIGN KEY (creator_id) REFERENCES public.creators(id) ON DELETE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_promolog_entries_creator_id
  ON public.promolog_entries(creator_id);


-- ─── of_gross_earnings.creator_id ────────────────────────────────────────
-- Ledger de earnings, creator_id ya es nullable (rows sin match van
-- al missing_creatos_id_of_gross_earnings).

UPDATE public.of_gross_earnings
SET creator_id = NULL
WHERE creator_id IS NOT NULL
  AND creator_id NOT IN (SELECT id FROM public.creators);

ALTER TABLE public.of_gross_earnings
  ADD CONSTRAINT of_gross_earnings_creator_id_fkey
    FOREIGN KEY (creator_id) REFERENCES public.creators(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_of_gross_earnings_creator_id
  ON public.of_gross_earnings(creator_id) WHERE creator_id IS NOT NULL;
