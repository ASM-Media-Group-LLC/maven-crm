-- whatsapp_daily_reports — reportes de jornada (LLGs y Closer Supervisors)
-- parseados automáticamente desde los mensajes del grupo.
--
-- Formato típico (LLG):
--   "Reporte Daniel: contactados 70, respuestas 1, números 0"
-- Formato típico (closer):
--   "Reporte Miguel: rechazadas 1, confirmadas 1, contactados 12, respuestas 5, cerrados 0"
--
-- El parsing lo hace el agent (Sonnet) leyendo el mensaje. Acá solo guardamos.

CREATE TABLE IF NOT EXISTS public.whatsapp_daily_reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  report_date       date NOT NULL,
  role_kind         text NOT NULL CHECK (role_kind IN ('llg', 'closer')),

  -- Métricas comunes (LLG y closer comparten estas)
  contactados       integer,
  respuestas        integer,

  -- LLG-only
  numeros_obtenidos integer,

  -- Closer-only
  confirmadas       integer,
  rechazadas        integer,
  canceladas        integer,
  cerradas          integer,
  seguimientos      integer,

  -- Extras estructurados (links de IG, etc) y datos raw
  links             jsonb DEFAULT '[]'::jsonb,
  raw_text          text,
  parsed_extras     jsonb DEFAULT '{}'::jsonb,

  -- Trazabilidad
  source_message_id uuid REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
  group_id          uuid REFERENCES public.whatsapp_groups(id) ON DELETE CASCADE,

  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Un solo reporte por user-fecha. Si vuelve a reportar, lo updateamos.
  UNIQUE (user_id, report_date)
);

CREATE INDEX IF NOT EXISTS whatsapp_daily_reports_date_idx
  ON public.whatsapp_daily_reports (report_date DESC);
CREATE INDEX IF NOT EXISTS whatsapp_daily_reports_user_idx
  ON public.whatsapp_daily_reports (user_id, report_date DESC);

-- RLS — admin/manager ven todo del tenant, el user solo el suyo.
ALTER TABLE public.whatsapp_daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY whatsapp_daily_reports_select_own
  ON public.whatsapp_daily_reports FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY whatsapp_daily_reports_select_admin
  ON public.whatsapp_daily_reports FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'manager', 'Closer Supervisor')
  ));

COMMENT ON TABLE public.whatsapp_daily_reports IS
  'Reportes de jornada del equipo del bot (LLGs y Closer Supervisors), parseados automáticamente por el agent desde mensajes del grupo.';
