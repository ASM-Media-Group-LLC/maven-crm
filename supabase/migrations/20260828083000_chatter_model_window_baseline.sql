-- Ventana larga por modelo (employee-reports con rango). Se conserva porque el
-- rango sirve para ver totales, PERO no para calcular la vara: BLU pierde la
-- atribucion por empleado a las ~2 semanas, asi que una ventana de 30 dias
-- contiene uno o dos dias de datos y dividir entre 30 deflacta todo. La vara
-- vive en chatter_model_baseline, sobre dias con registro.

CREATE TABLE IF NOT EXISTS public.chatter_model_window (
  ventana_desde date NOT NULL,
  ventana_hasta date NOT NULL,
  identity_id uuid NOT NULL REFERENCES public.chatter_identity(id) ON DELETE CASCADE,
  blu_model_id bigint NOT NULL,
  sales numeric(12,2) NOT NULL DEFAULT 0,
  fans_chatted integer NOT NULL DEFAULT 0,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ventana_desde, ventana_hasta, identity_id, blu_model_id)
);

CREATE INDEX IF NOT EXISTS idx_cmw_model ON public.chatter_model_window(blu_model_id, ventana_hasta DESC);
CREATE INDEX IF NOT EXISTS idx_cmw_identity ON public.chatter_model_window(identity_id, ventana_hasta DESC);

ALTER TABLE public.chatter_model_window ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Supervisores ven ventana" ON public.chatter_model_window;
CREATE POLICY "Supervisores ven ventana" ON public.chatter_model_window FOR SELECT TO authenticated
  USING (
    public.is_in_role_group(auth.uid(), 'supervisor_or_above')
    OR EXISTS (SELECT 1 FROM public.chatter_identity i
               WHERE i.id = chatter_model_window.identity_id AND i.maven_user_id = auth.uid())
  );

COMMENT ON TABLE public.chatter_model_window IS
  'Total por chatter y modelo en una ventana larga (employee-reports con rango). NO se usa para la vara: ver chatter_model_baseline.';
