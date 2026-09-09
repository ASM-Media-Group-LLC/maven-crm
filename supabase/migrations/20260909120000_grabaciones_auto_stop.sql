-- Grabaciones que nadie paró (09/09/2026: PLUS 2 llevaba 92 h "En curso",
-- CIERRES 13 h, PLUS 1 4 h con quien la inició ya fuera de la sala). El
-- barrido de cada 2 min ahora mira la sala en LiveKit y corta la grabación
-- cuando (a) la sala se quedó sin gente real o (b) quien la inició lleva un
-- rato afuera. Estas columnas guardan desde cuándo, para dar una gracia
-- corta y no cortar por un parpadeo de conexión.
alter table public.meeting_recordings
  add column if not exists sala_vacia_desde timestamptz,
  add column if not exists sin_iniciador_desde timestamptz,
  add column if not exists detenida_por text;
comment on column public.meeting_recordings.detenida_por is
  'null = la paró una persona · sala_vacia · iniciador_se_fue · abortada_admin (borrada por colgada)';
