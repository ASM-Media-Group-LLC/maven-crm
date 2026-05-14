-- Permite que users con data_scope='all' en Chatters (admins + roles
-- configurados) puedan borrar sesiones de OTROS examiners desde el
-- History. La policy chatter_sessions_delete original (chatter_evaluator_schema)
-- usa USING (examiner_user_id = auth.uid()), que es correcto para chatters
-- individuales pero impedía el bulk delete del History a admins.
--
-- Combinada con la policy original vía OR (Postgres OR-ea multiple policies
-- aplicables al mismo command), el efecto neto es:
--   · cada user puede borrar SUS propias sesiones (policy original)
--   · admins / scope='all' pueden borrar CUALQUIER sesión (esta policy)
--
-- Si en el futuro un user pierde el scope='all', la policy nueva deja de
-- aplicar y vuelve al comportamiento original sin necesidad de tocar code.

CREATE POLICY chatter_sessions_delete_global ON public.chatter_sessions
  FOR DELETE TO authenticated
  USING (public.has_chatter_global_scope(auth.uid()));
