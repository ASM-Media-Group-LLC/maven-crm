-- Conecta las 4 tablas grandes "huérfanas" al esquema multi-tenant.
-- Hasta ahora: 86k+39k+19k+16k = 160k+ rows sin tenant_id ni RLS.
-- Cualquier RLS-scoped UI las leía igual — no había aislamiento real.
--
-- Cambio:
--   1. ADD tenant_id uuid REFERENCES tenants(id) DEFAULT current_tenant_id()
--   2. Backfill al tenant ASM Tech (único hoy) para los rows existentes
--   3. NOT NULL después del backfill
--   4. FKs naturales que faltaban (creator_id, lg_user_id, etc.)
--   5. ENABLE RLS + policy "tenant_id = current_tenant_id()"
--
-- ASM Tech tenant id: 30869615-f579-4981-8a1f-dbebc61eae2d (verificado
-- en v3 antes de escribir esta migration). Si en el futuro hay
-- multi-tenant real, los rows nuevos ya van a tener tenant_id por
-- DEFAULT, y los viejos siguen apuntando a ASM.

-- ─── 1. leadgen_entries ──────────────────────────────────────────────────
-- Pipeline de captación de leads antes de que se vuelvan creators.
-- lg_user_id apunta al user que ingresó el lead. created_creator_id
-- (cuando existe) apunta a creators si el lead se cerró.

ALTER TABLE public.leadgen_entries
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE public.leadgen_entries
SET tenant_id = '30869615-f579-4981-8a1f-dbebc61eae2d'::uuid
WHERE tenant_id IS NULL;

ALTER TABLE public.leadgen_entries
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id(),
  ADD CONSTRAINT leadgen_entries_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- FK natural: lg_user_id ya apuntaba a auth.users pero sin constraint.
ALTER TABLE public.leadgen_entries
  ADD CONSTRAINT leadgen_entries_lg_user_id_fkey
    FOREIGN KEY (lg_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- FK opcional: created_creator_id (cuando el lead se convirtió a creator)
ALTER TABLE public.leadgen_entries
  ADD CONSTRAINT leadgen_entries_created_creator_id_fkey
    FOREIGN KEY (created_creator_id) REFERENCES public.creators(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leadgen_entries_tenant_id
  ON public.leadgen_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leadgen_entries_lg_user_id
  ON public.leadgen_entries(lg_user_id);
CREATE INDEX IF NOT EXISTS idx_leadgen_entries_created_creator_id
  ON public.leadgen_entries(created_creator_id) WHERE created_creator_id IS NOT NULL;

ALTER TABLE public.leadgen_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leadgen_entries_tenant_scoped" ON public.leadgen_entries;
CREATE POLICY "leadgen_entries_tenant_scoped" ON public.leadgen_entries
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());


-- ─── 2. promolog_entries ─────────────────────────────────────────────────
-- Tracking de actividad promocional por creator. creator_id ya existe
-- pero sin FK constraint formal.

ALTER TABLE public.promolog_entries
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE public.promolog_entries
SET tenant_id = '30869615-f579-4981-8a1f-dbebc61eae2d'::uuid
WHERE tenant_id IS NULL;

ALTER TABLE public.promolog_entries
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id(),
  ADD CONSTRAINT promolog_entries_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- FK natural: creator_id → creators. Es NOT NULL en la tabla, así que
-- ON DELETE CASCADE (si el creator se borra, sus promolog también).
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

CREATE INDEX IF NOT EXISTS idx_promolog_entries_tenant_id
  ON public.promolog_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_promolog_entries_creator_id
  ON public.promolog_entries(creator_id);

ALTER TABLE public.promolog_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promolog_entries_tenant_scoped" ON public.promolog_entries;
CREATE POLICY "promolog_entries_tenant_scoped" ON public.promolog_entries
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());


-- ─── 3. of_gross_earnings ────────────────────────────────────────────────
-- Ledger denormalizado de earnings de OnlyFans. creator_id es nullable
-- (muchos rows sin match a creator todavía — esos van al "missing"
-- table de abajo). FK con ON DELETE SET NULL para no perder data si
-- se borra un creator.

ALTER TABLE public.of_gross_earnings
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE public.of_gross_earnings
SET tenant_id = '30869615-f579-4981-8a1f-dbebc61eae2d'::uuid
WHERE tenant_id IS NULL;

ALTER TABLE public.of_gross_earnings
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id(),
  ADD CONSTRAINT of_gross_earnings_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.of_gross_earnings
  ADD CONSTRAINT of_gross_earnings_creator_id_fkey
    FOREIGN KEY (creator_id) REFERENCES public.creators(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_of_gross_earnings_tenant_id
  ON public.of_gross_earnings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_of_gross_earnings_creator_id
  ON public.of_gross_earnings(creator_id) WHERE creator_id IS NOT NULL;

ALTER TABLE public.of_gross_earnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "of_gross_earnings_tenant_scoped" ON public.of_gross_earnings;
CREATE POLICY "of_gross_earnings_tenant_scoped" ON public.of_gross_earnings
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());


-- ─── 4. missing_creatos_id_of_gross_earnings ─────────────────────────────
-- Audit/error log: rows de of_gross_earnings sin creator_id matchaeado.
-- Tabla con typo en el nombre (creatos vs creators) que dejamos por
-- compatibilidad — renombrarla es otra migration aparte.

ALTER TABLE public.missing_creatos_id_of_gross_earnings
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE public.missing_creatos_id_of_gross_earnings
SET tenant_id = '30869615-f579-4981-8a1f-dbebc61eae2d'::uuid
WHERE tenant_id IS NULL;

ALTER TABLE public.missing_creatos_id_of_gross_earnings
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id(),
  ADD CONSTRAINT missing_creatos_id_of_gross_earnings_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_missing_creatos_id_of_gross_earnings_tenant_id
  ON public.missing_creatos_id_of_gross_earnings(tenant_id);

ALTER TABLE public.missing_creatos_id_of_gross_earnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "missing_creatos_id_of_gross_earnings_tenant_scoped"
  ON public.missing_creatos_id_of_gross_earnings;
CREATE POLICY "missing_creatos_id_of_gross_earnings_tenant_scoped"
  ON public.missing_creatos_id_of_gross_earnings
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());
