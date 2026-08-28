-- ═══════════════════════════════════════════════════════════════════════════
-- BASE DEL DASHBOARD DE CHATTERS
-- 1) Identidad unica de cada persona, separada de sus cuentas en cada sistema.
-- 2) Masivos persistidos (hoy solo viven en BLU, en vivo).
-- 3) Snapshot diario de que modelos atiende cada quien.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.chatter_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  maven_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Parte del email ANTES de la arroba. Es lo que sobrevive a la migracion de
  -- @unlok.me a @maven-ai.me y permite re-vincular sin adivinar por nombre.
  email_local text,
  is_chatter boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chatter_identity_maven_user
  ON public.chatter_identity(maven_user_id) WHERE maven_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chatter_identity_email_local
  ON public.chatter_identity(lower(email_local));

-- Cuentas externas CON VIGENCIA. Si en BLU borran la cuenta y crean otra, la
-- persona no cambia: se cierra el vinculo viejo y se abre uno nuevo sobre la
-- MISMA identidad, y el historico queda unido.
CREATE TABLE IF NOT EXISTS public.chatter_identity_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES public.chatter_identity(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('blu', 'hubstaff')),
  external_id text NOT NULL,
  external_email text,
  matched_by text CHECK (matched_by IN ('email', 'email_local', 'manual')),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  confirmed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_identity_link_vigente
  ON public.chatter_identity_link(source, external_id) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_identity_link_identity
  ON public.chatter_identity_link(identity_id, source);

COMMENT ON TABLE public.chatter_identity_link IS
  'Cuentas externas de cada persona CON VIGENCIA. El email sirve para descubrir el vinculo, no para sostenerlo: una vez creado, el correo puede cambiar de dominio sin romper nada.';

-- Masivos. Hoy se consultan en vivo a BLU y no se guardan: si borran una cuenta,
-- su historico se va con ella.
CREATE TABLE IF NOT EXISTS public.chatter_mass_messages (
  blu_id text PRIMARY KEY,
  blu_model_id bigint,
  model_name text,
  sender_name text,
  identity_id uuid REFERENCES public.chatter_identity(id) ON DELETE SET NULL,
  kind text CHECK (kind IN ('of-mass', 'priority')),
  copy text,
  price numeric(12,2) NOT NULL DEFAULT 0,
  sent integer NOT NULL DEFAULT 0,
  viewed integer NOT NULL DEFAULT 0,
  purchased integer NOT NULL DEFAULT 0,
  earnings numeric(12,2) NOT NULL DEFAULT 0,
  sent_at timestamptz,
  -- Dia de Bogota: agrupar por el timestamp UTC corre las ventas de la noche al
  -- dia siguiente (el mismo problema que ya paso con promolog).
  dia date GENERATED ALWAYS AS (((sent_at AT TIME ZONE 'America/Bogota'))::date) STORED,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mass_identity_dia
  ON public.chatter_mass_messages(identity_id, dia DESC);
CREATE INDEX IF NOT EXISTS idx_mass_dia ON public.chatter_mass_messages(dia DESC);

-- Que modelos atiende cada quien, POR DIA. Un snapshot diario (y no un rango con
-- vigencias) hace que el pasado no se altere cuando cambian las asignaciones.
CREATE TABLE IF NOT EXISTS public.chatter_creator_assignment_daily (
  dia date NOT NULL,
  identity_id uuid NOT NULL REFERENCES public.chatter_identity(id) ON DELETE CASCADE,
  blu_model_id bigint NOT NULL,
  PRIMARY KEY (dia, identity_id, blu_model_id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_dia ON public.chatter_creator_assignment_daily(dia DESC);

ALTER TABLE public.chatter_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatter_identity_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatter_mass_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatter_creator_assignment_daily ENABLE ROW LEVEL SECURITY;

-- Rendimiento del equipo: lo ve supervisor o superior. Cada quien ve lo suyo.
DROP POLICY IF EXISTS "Supervisores ven identidades" ON public.chatter_identity;
CREATE POLICY "Supervisores ven identidades" ON public.chatter_identity FOR SELECT TO authenticated
  USING (public.is_in_role_group(auth.uid(), 'supervisor_or_above') OR maven_user_id = auth.uid());

DROP POLICY IF EXISTS "Supervisores ven vinculos" ON public.chatter_identity_link;
CREATE POLICY "Supervisores ven vinculos" ON public.chatter_identity_link FOR SELECT TO authenticated
  USING (public.is_in_role_group(auth.uid(), 'supervisor_or_above'));

DROP POLICY IF EXISTS "Supervisores ven masivos" ON public.chatter_mass_messages;
CREATE POLICY "Supervisores ven masivos" ON public.chatter_mass_messages FOR SELECT TO authenticated
  USING (
    public.is_in_role_group(auth.uid(), 'supervisor_or_above')
    OR EXISTS (SELECT 1 FROM public.chatter_identity i
               WHERE i.id = chatter_mass_messages.identity_id AND i.maven_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Supervisores ven asignaciones" ON public.chatter_creator_assignment_daily;
CREATE POLICY "Supervisores ven asignaciones" ON public.chatter_creator_assignment_daily FOR SELECT TO authenticated
  USING (
    public.is_in_role_group(auth.uid(), 'supervisor_or_above')
    OR EXISTS (SELECT 1 FROM public.chatter_identity i
               WHERE i.id = chatter_creator_assignment_daily.identity_id AND i.maven_user_id = auth.uid())
  );
