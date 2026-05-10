-- 20260510090000_chatter_realtime_fixes.sql
--
-- Two paired fixes for the chatter evaluator's realtime delivery, both
-- exposed once `maven.asmtech.ai` started taking real production traffic
-- after the v2/v3 cutover.
--
-- 1. RLS catch-22 on session-end: the chatter side (anon role) couldn't
--    see sessions where status='ended', so the realtime UPDATE event
--    fired by `examiner ends session` was filtered out by RLS before it
--    could reach the chatter's browser. Result: the chatter UI stayed on
--    "active" forever and never rendered the "session ended" screen.
--    Fix: open the SELECT policy for anon to ALL statuses. Writes are
--    still gated by the separate `chatter_sessions_anon_update_typing`
--    policy which keeps the `status <> 'ended'` filter, so the chatter
--    still can't write to ended sessions.
--    Same applied to chatter_messages_anon_read.
--
-- 2. REPLICA IDENTITY DEFAULT meant the WAL only carried the PK on
--    UPDATE — fine for simple PK-filtered subscriptions, but unreliable
--    when realtime needs to evaluate RLS against the new row state
--    (e.g. typing_chatter / typing_fan toggles in chatter_sessions).
--    Switching to FULL makes the full row available in every event so
--    realtime can authorize delivery deterministically.

DROP POLICY IF EXISTS chatter_sessions_anon_read ON public.chatter_sessions;
CREATE POLICY chatter_sessions_anon_read ON public.chatter_sessions
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS chatter_messages_anon_read ON public.chatter_messages;
CREATE POLICY chatter_messages_anon_read ON public.chatter_messages
  FOR SELECT TO anon
  USING (true);

ALTER TABLE public.chatter_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.chatter_messages REPLICA IDENTITY FULL;
