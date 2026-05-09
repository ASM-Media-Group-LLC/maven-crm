-- 20260509020000_scouter_spam_accounts.sql
--
-- Tabla nueva para que los scouters/spammers registren las cuentas de
-- Instagram que usan personalmente para hacer outreach (DMs, follows,
-- comentarios). El manager las ve en el tab "Cuentas" de Scouter Assist
-- para auditar quién usa qué cuenta y rotarlas si las banean.
--
-- Sigue el patrón estándar de tenant isolation usado por los otros
-- scouter_* (current_tenant_id() default + RLS por tenant).

CREATE TABLE IF NOT EXISTS public.scouter_spam_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
                  DEFAULT public.current_tenant_id(),
  scouter_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Handle sin @, lowercase. Se valida en el frontend al insertar.
  instagram_handle text NOT NULL,
  instagram_url   text,
  display_name    text,
  -- Estado operativo de la cuenta — útil para que el manager sepa
  -- cuándo rotar o reemplazar:
  --   active        — funcionando normal
  --   shadowbanned  — IG limita reach pero todavía sirve
  --   banned        — IG la cerró, no se puede usar
  --   retired       — la dejamos descansar a propósito (cool-down)
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'shadowbanned', 'banned', 'retired')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Una cuenta de IG no puede registrarse dos veces dentro del mismo
  -- tenant. Si dos scouters comparten una, sale por chequeo manual.
  CONSTRAINT scouter_spam_accounts_unique_handle_per_tenant
    UNIQUE (tenant_id, instagram_handle)
);

CREATE INDEX IF NOT EXISTS scouter_spam_accounts_tenant_idx
  ON public.scouter_spam_accounts (tenant_id);

CREATE INDEX IF NOT EXISTS scouter_spam_accounts_scouter_idx
  ON public.scouter_spam_accounts (scouter_id);

-- Trigger para mantener updated_at sincronizado.
CREATE OR REPLACE FUNCTION public.scouter_spam_accounts_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scouter_spam_accounts_updated_at_trigger
  ON public.scouter_spam_accounts;
CREATE TRIGGER scouter_spam_accounts_updated_at_trigger
  BEFORE UPDATE ON public.scouter_spam_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.scouter_spam_accounts_set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.scouter_spam_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scouter_spam_accounts_tenant" ON public.scouter_spam_accounts;
CREATE POLICY "scouter_spam_accounts_tenant" ON public.scouter_spam_accounts
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scouter_spam_accounts TO authenticated;
