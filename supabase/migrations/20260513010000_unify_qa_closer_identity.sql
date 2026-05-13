-- Unificar identidad de closers en QA — un solo ID por persona.
--
-- Antes:
--   · closer_creators.assigned_to → profiles.id    (espacio A)
--   · qa_calls.closer_id          → qa_closers.id (espacio B)
-- qa_closers.profile_id era el nexo opcional. Si era NULL, joins
-- cross-tabla daban "Sin nombre" y la misma persona aparecía 2 veces
-- en reportes (una vez por cada espacio de ID).
--
-- Después:
--   · closer_creators.assigned_to → profiles.id
--   · qa_calls.closer_id          → profiles.id  ← unificado
--   · qa_chat_sessions.scope_closer_id → profiles.id ← unificado
--   · qa_closers queda como tabla legacy (drop futuro).
--
-- Solo había 2 qa_closers, ambos con profile_id no-null. Migración trivial.

BEGIN;

-- 1) Drop FKs viejas (la UPDATE las violaría sino).
ALTER TABLE public.qa_calls
  DROP CONSTRAINT IF EXISTS qa_calls_closer_id_fkey;
ALTER TABLE public.qa_chat_sessions
  DROP CONSTRAINT IF EXISTS qa_chat_sessions_scope_closer_id_fkey;

-- 2) Repuntar closer_id: qa_closer_id → profile_id.
UPDATE public.qa_calls qc
SET closer_id = qcl.profile_id
FROM public.qa_closers qcl
WHERE qc.closer_id = qcl.id;

UPDATE public.qa_chat_sessions qcs
SET scope_closer_id = qcl.profile_id
FROM public.qa_closers qcl
WHERE qcs.scope_closer_id = qcl.id;

-- 3) Nuevas FKs → profiles.id.
ALTER TABLE public.qa_calls
  ADD CONSTRAINT qa_calls_closer_id_fkey
  FOREIGN KEY (closer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.qa_chat_sessions
  ADD CONSTRAINT qa_chat_sessions_scope_closer_id_fkey
  FOREIGN KEY (scope_closer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMIT;
