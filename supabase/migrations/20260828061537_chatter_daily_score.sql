-- ═══════════════════════════════════════════════════════════════════════════
-- NOTA DIARIA DEL CHATTER (1-10), como las de los grupos de WhatsApp.
--
-- LA IDEA CENTRAL (definicion de Jhon): la vara NO es un numero fijo ni la
-- historia del chatter, son SUS MODELOS. Si sus modelos promedian 170/dia entre
-- todas, eso es lo que se espera de el. Asi, 400 puede ser malo para uno y muy
-- bueno para otro, y un chatter nuevo tiene vara desde el primer dia.
--
-- LOS UMBRALES VIVEN EN UNA TABLA, no dentro de la funcion: los arreglos
-- metidos en el cuerpo de una funcion de notas ya se perdieron dos veces en
-- este proyecto (ver corte_nota). Aca se ajustan sin deploy.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.chatter_score_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  peso_ventas numeric NOT NULL DEFAULT 0.50,
  peso_tiempo numeric NOT NULL DEFAULT 0.30,
  peso_meet numeric NOT NULL DEFAULT 0.20,
  -- Regla dura de Jhon: menos de esto en el dia es malo aunque sus modelos den poco.
  piso_ventas_usd numeric NOT NULL DEFAULT 100,
  nota_si_bajo_piso numeric NOT NULL DEFAULT 2,
  horas_turno numeric NOT NULL DEFAULT 8,
  dias_promedio_modelo integer NOT NULL DEFAULT 30,
  -- [{"ratio": 1.2, "nota": 10}, ...] de mayor a menor; se toma la primera que cumple.
  escala_ventas jsonb NOT NULL DEFAULT '[
    {"ratio": 1.20, "nota": 10}, {"ratio": 1.00, "nota": 9},
    {"ratio": 0.85, "nota": 7},  {"ratio": 0.70, "nota": 5},
    {"ratio": 0.50, "nota": 3},  {"ratio": 0.00, "nota": 1}]'::jsonb,
  escala_tiempo jsonb NOT NULL DEFAULT '[
    {"ratio": 0.95, "nota": 10}, {"ratio": 0.85, "nota": 8},
    {"ratio": 0.70, "nota": 6},  {"ratio": 0.50, "nota": 4},
    {"ratio": 0.00, "nota": 2}]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

INSERT INTO public.chatter_score_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.chatter_score_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Supervisores leen config de nota" ON public.chatter_score_config;
CREATE POLICY "Supervisores leen config de nota" ON public.chatter_score_config FOR SELECT TO authenticated
  USING (public.is_in_role_group(auth.uid(), 'supervisor_or_above'));
DROP POLICY IF EXISTS "Admins cambian config de nota" ON public.chatter_score_config;
CREATE POLICY "Admins cambian config de nota" ON public.chatter_score_config FOR UPDATE TO authenticated
  USING (public.is_in_role_group(auth.uid(), 'admin'))
  WITH CHECK (public.is_in_role_group(auth.uid(), 'admin'));

-- La nota se GUARDA el dia que se calcula. Si mañana se ajustan los pesos, el
-- martes pasado de una persona no cambia solo: nadie deberia enterarse de que su
-- nota de la semana pasada ahora vale otra cosa.
CREATE TABLE IF NOT EXISTS public.chatter_daily_score (
  dia date NOT NULL,
  identity_id uuid NOT NULL REFERENCES public.chatter_identity(id) ON DELETE CASCADE,
  ventas numeric(12,2),
  ventas_esperadas numeric(12,2),
  nota_ventas numeric(4,2),
  horas numeric(6,2),
  nota_tiempo numeric(4,2),
  nota_meet numeric(4,2),
  nota numeric(4,2),
  -- Para poder explicar por que salio esa nota meses despues.
  detalle jsonb,
  config_snapshot jsonb,
  calculada_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dia, identity_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_score_identity ON public.chatter_daily_score(identity_id, dia DESC);

ALTER TABLE public.chatter_daily_score ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Notas: supervisores y el propio" ON public.chatter_daily_score;
CREATE POLICY "Notas: supervisores y el propio" ON public.chatter_daily_score FOR SELECT TO authenticated
  USING (
    public.is_in_role_group(auth.uid(), 'supervisor_or_above')
    OR EXISTS (SELECT 1 FROM public.chatter_identity i
               WHERE i.id = chatter_daily_score.identity_id AND i.maven_user_id = auth.uid())
  );

COMMENT ON TABLE public.chatter_daily_score IS
  'Nota diaria 1-10 por chatter. Se guarda con el snapshot de la config usada: cambiar los pesos no reescribe el pasado.';
