-- cloudphone_sessions — log de uso de los cloud phones (medida de control de tiempo / costo).
-- El reaper vive en el micro (in-memory, sin cron). Esta tabla SOLO es el registro para reporte:
-- el edge inserta al abrir, cierra al apagar, y reconcilia las cerradas por el reaper en el próximo list.
CREATE TABLE IF NOT EXISTS public.cloudphone_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  text NOT NULL,
  serial_name text,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  end_reason  text,        -- 'manual' | 'timeout' | 'stale' | 'replaced'
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cloudphone_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access on cloudphone_sessions" ON public.cloudphone_sessions;
CREATE POLICY "Admins full access on cloudphone_sessions"
  ON public.cloudphone_sessions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users see own cloudphone sessions" ON public.cloudphone_sessions;
CREATE POLICY "Users see own cloudphone sessions"
  ON public.cloudphone_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- rows abiertas (para reconciliar rápido) + uso por usuario
CREATE INDEX IF NOT EXISTS idx_cloudphone_sessions_open ON public.cloudphone_sessions (profile_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cloudphone_sessions_user ON public.cloudphone_sessions (user_id, started_at DESC);
