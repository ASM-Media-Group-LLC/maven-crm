-- Dedup de los checks GRUPALES del whatsapp-supervisor-tick.
--
-- Bug: el supervisor deduplica con `whatsapp_supervisor_state`, cuya columna
-- `user_id` tiene FK -> profiles(id). Los checks GRUPALES (EOD + follow-ups)
-- claimaban con `group.tenant_id` como user_id; como el tenant_id NO es un
-- profile, el INSERT violaba el FK → tryClaim devolvía false → `if (!ok) return`
-- → esos checks NUNCA dispararon (EOD, pre_meeting, meeting_followup,
-- promise_overdue, tracking_stale, closer_contact_overdue, confirmada_stale,
-- monetization_followup). Toda la parte proactiva "persigue" estaba muerta.
--
-- Fix: tabla de dedup grupal SIN FK, con PK (group_id, check_kind, check_date).
-- El supervisor usa tryClaimGroup() contra esta tabla para los checks grupales.
--
-- Solo service_role (edge functions). RLS ON sin policies = sin acceso
-- para authenticated/anon.

CREATE TABLE IF NOT EXISTS public.whatsapp_supervisor_group_state (
  group_id uuid NOT NULL,
  check_kind text NOT NULL,
  check_date date NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, check_kind, check_date)
);

ALTER TABLE public.whatsapp_supervisor_group_state ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.whatsapp_supervisor_group_state IS
  'Dedup de checks GRUPALES del whatsapp-supervisor-tick (EOD + follow-ups). Reemplaza el uso de whatsapp_supervisor_state con user_id=tenant_id, que fallaba por el FK user_id->profiles. PK (group_id, check_kind, check_date).';
