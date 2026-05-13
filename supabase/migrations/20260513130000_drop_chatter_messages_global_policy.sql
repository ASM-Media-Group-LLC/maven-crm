-- La policy chatter_messages_read_global (creada en chatter_global_scope)
-- rompía el realtime: el worker de Supabase Realtime evalúa TODAS las
-- policies aplicables al SELECT, y has_chatter_global_scope() tiene joins
-- internos (user_roles + roles_config + role_permissions). Bajo carga
-- multi-cliente eso falla silenciosamente y los broadcasts se dropean —
-- exactamente el bug que la denormalización de examiner_user_id intentaba
-- resolver, pero esta policy lo reintroducía vía la función con joins.
--
-- La motivación original era que admins pudieran ver mensajes globalmente
-- para HistorySessionDetail de sesiones de otros examiners. Si llega a
-- hacer falta lo movemos a un RPC SECURITY DEFINER — por ahora priorizamos
-- realtime correcto.
--
-- chatter_sessions_read_global y chatter_evaluations_read_global se quedan:
-- las usa el History list y los KPI stats, y no están en el hot path de
-- realtime de mensajes.

DROP POLICY IF EXISTS chatter_messages_read_global ON public.chatter_messages;
