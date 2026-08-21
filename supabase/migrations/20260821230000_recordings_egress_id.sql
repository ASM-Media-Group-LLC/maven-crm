-- El id del trabajo de egress en LiveKit. Sin él no se puede PARAR una
-- grabación ni reconciliar las que quedaron colgadas (navegador cerrado
-- sin detener: la sala muere, egress termina solo, y la fila queda en
-- 'recording' para siempre si no podemos preguntarle a LiveKit).
ALTER TABLE public.meeting_recordings ADD COLUMN IF NOT EXISTS egress_id text;
CREATE INDEX IF NOT EXISTS meeting_recordings_egress_idx
  ON public.meeting_recordings (egress_id) WHERE egress_id IS NOT NULL;
