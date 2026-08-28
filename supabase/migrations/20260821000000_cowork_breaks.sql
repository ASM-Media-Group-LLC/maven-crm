-- ═══════════════════════════════════════════════════════════════════════════
-- HISTÓRICO DE PAUSAS de Cowork (el botón "Ir al baño")
--
-- El indicador EN VIVO viaja por presence y no deja rastro. Esto es lo otro que
-- pidió Jhon: el registro, para poder responder "cuántas pausas y cuánto tiempo
-- se lleva cada uno". Todavía no hay dónde mostrarlo —viene un dashboard de
-- chatters— pero se captura desde ya: un histórico no se puede reconstruir hacia
-- atrás.
--
-- LOS TIEMPOS LOS PONE EL SERVIDOR (now()), no el cliente. Si el navegador
-- mandara `started_at`, el dato sería lo que el propio medido dice que duró.
--
-- ES DATO SENSIBLE DE EMPLEADOS: quién se levanta, cuántas veces y por cuánto.
-- Por eso RLS lo restringe a la persona misma, a los hosts de esa sesión y a
-- supervisor o superior — no a cualquiera con cuenta en Maven.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.cowork_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.cowork_sessions(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.cowork_rooms(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  -- true cuando la cerramos nosotros porque quedó colgada (cerró la pestaña sin
  -- volver). Sin esto, una pausa abandonada contaría como "8 horas en el baño" y
  -- ensuciaría cualquier promedio.
  auto_closed boolean NOT NULL DEFAULT false,
  duration_seconds integer GENERATED ALWAYS AS (
    CASE WHEN ended_at IS NULL THEN NULL
         ELSE GREATEST(0, EXTRACT(EPOCH FROM (ended_at - started_at))::integer)
    END
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_cowork_breaks_user_started
  ON public.cowork_breaks(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cowork_breaks_session
  ON public.cowork_breaks(session_id, started_at DESC);
-- Una sola pausa abierta por persona: el índice lo garantiza, no la buena fe del
-- cliente (dos pestañas abiertas podrían abrir dos).
CREATE UNIQUE INDEX IF NOT EXISTS uq_cowork_breaks_open
  ON public.cowork_breaks(user_id) WHERE ended_at IS NULL;

ALTER TABLE public.cowork_breaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own breaks"
  ON public.cowork_breaks FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Hosts see breaks of their session"
  ON public.cowork_breaks FOR SELECT TO authenticated
  USING (public.is_cowork_host(auth.uid(), session_id));

CREATE POLICY "Supervisors see all breaks"
  ON public.cowork_breaks FOR SELECT TO authenticated
  USING (public.is_in_role_group(auth.uid(), 'supervisor_or_above'));

COMMENT ON TABLE public.cowork_breaks IS
  'Histórico de pausas de Cowork. Los timestamps los pone el servidor vía la edge cowork-session (startBreak/endBreak). El estado EN VIVO va por presence, no por acá.';
COMMENT ON COLUMN public.cowork_breaks.auto_closed IS
  'La cerró el sistema por quedar colgada (la persona cerró la pestaña). Excluir de los promedios.';
