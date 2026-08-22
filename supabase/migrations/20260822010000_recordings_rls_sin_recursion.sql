-- La policy de recipients miraba meeting_recordings y la de recordings mira
-- recipients: al consultar cualquiera, Postgres detectaba el ciclo y tiraba
-- 42P17 "infinite recursion detected" -- /grabaciones cargaba vacia.
--
-- Se corta UNA direccion: recipients queda solo "soy yo o soy admin". El
-- iniciador pierde la lectura directa de a quienes compartio (la UI no la
-- usa; la edge opera con service_role y no pasa por RLS).
--
-- APLICADA A MANO en prod via SQL editor el 2026-08-21 (el MCP estaba sin
-- autorizar); este archivo existe para que el repo refleje prod.

ALTER POLICY meeting_recording_recipients_select
  ON public.meeting_recording_recipients
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::text));
