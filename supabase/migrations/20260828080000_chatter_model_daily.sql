-- ═══════════════════════════════════════════════════════════════════════════
-- QUE MODELO ATENDIO CADA CHATTER CADA DIA, Y CUANTO VENDIO EN ELLA.
--
-- Es la pieza que faltaba para la nota. `assignedCreators` de BLU no sirve de
-- vara: es "a que modelos tiene ACCESO", y cada modelo esta habilitada para
-- 25-30 chatters, asi que la suma de sus promedios le daba a todos la misma
-- vara — la facturacion entera de la agencia. Medido el 28/08: el chatter
-- mediano tenia 32 de 33 modelos "asignadas", pero los reportes muestran que en
-- un dia real atiende entre 5 y 9.
--
-- El dato real sale de agency:analytics:employee-reports filtrando por
-- creatorIds: con una sola modelo en el filtro, la respuesta trae unicamente a
-- los chatters que la atendieron ese dia y cuanto vendio cada uno.
--
-- Con esto la definicion de Jhon se vuelve calculable: la vara de un chatter es
-- la suma de lo que producen en promedio las modelos que realmente atiende.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.chatter_model_daily (
  dia date NOT NULL,
  identity_id uuid NOT NULL REFERENCES public.chatter_identity(id) ON DELETE CASCADE,
  blu_model_id bigint NOT NULL,
  model_name text,
  sales numeric(12,2) NOT NULL DEFAULT 0,
  fans_chatted integer NOT NULL DEFAULT 0,
  sold_messages integer NOT NULL DEFAULT 0,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dia, identity_id, blu_model_id)
);

CREATE INDEX IF NOT EXISTS idx_cmd_identity_dia ON public.chatter_model_daily(identity_id, dia DESC);
CREATE INDEX IF NOT EXISTS idx_cmd_model_dia ON public.chatter_model_daily(blu_model_id, dia DESC);

-- Que dias ya se trajeron y para que modelos: sin esto no hay forma de saber si
-- un dia sin filas es "nadie atendio" o "todavia no lo hemos traido", que es
-- justo la confusion que hace que una nota mienta.
CREATE TABLE IF NOT EXISTS public.chatter_model_daily_sync (
  dia date NOT NULL,
  blu_model_id bigint NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  chatters integer NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, blu_model_id)
);

ALTER TABLE public.chatter_model_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatter_model_daily_sync ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Supervisores ven modelo-dia" ON public.chatter_model_daily;
CREATE POLICY "Supervisores ven modelo-dia" ON public.chatter_model_daily FOR SELECT TO authenticated
  USING (
    public.is_in_role_group(auth.uid(), 'supervisor_or_above')
    OR EXISTS (SELECT 1 FROM public.chatter_identity i
               WHERE i.id = chatter_model_daily.identity_id AND i.maven_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Supervisores ven cobertura" ON public.chatter_model_daily_sync;
CREATE POLICY "Supervisores ven cobertura" ON public.chatter_model_daily_sync FOR SELECT TO authenticated
  USING (public.is_in_role_group(auth.uid(), 'supervisor_or_above'));

COMMENT ON TABLE public.chatter_model_daily IS
  'Que modelos atendio cada chatter cada dia y cuanto vendio en cada una. Sale de employee-reports filtrado por creatorIds, una consulta por modelo y dia.';
COMMENT ON TABLE public.chatter_model_daily_sync IS
  'Cobertura de la ingesta: un dia sin filas en chatter_model_daily solo significa "nadie atendio" si el par (dia, modelo) figura aca.';
