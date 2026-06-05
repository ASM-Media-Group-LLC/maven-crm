-- Dedup atómico del night_catchup / "Apertura del día" del bot de WhatsApp.
--
-- Bug (04/06/2026): cuando varios miembros saludaban casi simultáneos a la mañana
-- ("buenos días / activo"), el ingest disparaba night_catchup por CADA mensaje que
-- entraba mientras el bot estaba "dormido >6h". Como la apertura tarda unos segundos
-- en generarse, para todos esos mensajes el "último mensaje del bot" seguía siendo el
-- de ayer (>6h) → se disparaban múltiples catchups → la apertura salía DUPLICADA
-- (ese día: 2 a 20s de diferencia).
--
-- Fix: el ingest hace un INSERT atómico acá ANTES de disparar el catchup. El PK
-- (group_id, catchup_date) garantiza UNA sola apertura por grupo/día: el primer
-- mensaje gana el claim y dispara; los demás chocan con el PK y se saltean.
--
-- Solo la tocan las edge functions (service_role). RLS ON sin policies = sin acceso
-- para authenticated/anon.

CREATE TABLE IF NOT EXISTS public.whatsapp_catchup_claims (
  group_id uuid NOT NULL,
  catchup_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, catchup_date)
);

ALTER TABLE public.whatsapp_catchup_claims ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.whatsapp_catchup_claims IS
  'Dedup atomico del night_catchup/apertura del bot de WhatsApp: 1 fila por grupo+dia. El ingest inserta ANTES de disparar el catchup; el PK (group_id, catchup_date) evita aperturas duplicadas cuando llegan varios mensajes casi simultaneos.';
