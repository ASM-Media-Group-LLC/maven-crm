-- Avisar: lo puede usar CUALQUIER anfitrión del Cowork (decisión de Alvaro,
-- 17/11/2026). Antes era una lista fija de 4 personas (Luis, Daniel, Grace y
-- Alvaro) y Breyner y Vanessa, anfitriones de Chatters, no veían el botón.
-- Se mantiene: el que avisa es anfitrión de esa sesión, no se avisa a sí mismo,
-- a otro anfitrión solo lo avisa un admin.
ALTER POLICY avisos_insert_supervisores ON public.cowork_avisos
  WITH CHECK (
    created_by = (select auth.uid())
    AND is_cowork_host((select auth.uid()), session_id)
    AND user_id <> (select auth.uid())
    AND (
      NOT is_cowork_host(user_id, session_id)
      OR is_in_role_group((select auth.uid()), 'admin')
    )
  );
