-- RPC para leer chatter_messages de una sesión, con soporte para
-- global scope de admins/managers.
--
-- Contexto: en `20260513130000_drop_chatter_messages_global_policy.sql`
-- se dropeó la policy `chatter_messages_read_global` porque su función
-- `has_chatter_global_scope()` tenía joins internos que rompían el
-- Realtime worker (broadcast de mensajes fallaba silenciosamente bajo
-- carga). El comentario de esa migration dejó el TODO explícito:
-- "Si llega a hacer falta lo movemos a un RPC SECURITY DEFINER — por
-- ahora priorizamos realtime correcto."
--
-- Bug que destrabamos hoy: el botón "Ver transcript" en el email del
-- chatter-evaluator linkea a /chatter-evaluator/history/:sessionId.
-- El admin/manager que recibe el correo:
--   · ve la sesión (chatter_sessions_read_global sigue activa)
--   · ve la evaluación (chatter_evaluations_read_global sigue activa)
--   · NO ve los mensajes (la policy global se dropeó)
--
-- Solución: SECURITY DEFINER RPC que devuelve los mensajes si:
--   1. El caller es el examiner_user_id de la sesión, O
--   2. El caller tiene global scope (chequea has_chatter_global_scope()
--      adentro del cuerpo, no en una policy — así no entra al hot path
--      del Realtime).
--
-- El hook frontend (useChatterMessages) se cambia para llamar al RPC.
-- Para mensajes en vivo del workspace seguimos usando broadcast — el RPC
-- es solo para el SELECT inicial / re-fetch.

CREATE OR REPLACE FUNCTION public.app_get_chatter_messages(p_session_id text)
RETURNS SETOF public.chatter_messages
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_session_examiner uuid;
BEGIN
  -- Sin auth no devolvemos nada.
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Resolvemos el examiner de la sesión (denormalizamos vs hacer EXISTS
  -- dentro del WHERE — más legible y permite logging futuro si hace falta).
  SELECT examiner_user_id INTO v_session_examiner
  FROM public.chatter_sessions
  WHERE id = p_session_id;

  -- Sesión inexistente → no devuelve nada (frontend muestra "Sin mensajes").
  IF v_session_examiner IS NULL THEN
    RETURN;
  END IF;

  -- Permitido si: es el examiner propio O tiene global scope.
  IF v_user_id = v_session_examiner
     OR public.has_chatter_global_scope(v_user_id) THEN
    RETURN QUERY
      SELECT *
      FROM public.chatter_messages
      WHERE session_id = p_session_id
      ORDER BY created_at ASC;
  END IF;
  -- Sin permiso → return vacío (NOT EXISTS, no exception — más amigable
  -- para el frontend, mismo comportamiento que la policy RLS antes).
END;
$$;

REVOKE ALL ON FUNCTION public.app_get_chatter_messages(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_get_chatter_messages(text) TO authenticated;

COMMENT ON FUNCTION public.app_get_chatter_messages(text) IS
  'Devuelve los mensajes de una sesión de chatter-evaluator. '
  'Usa SECURITY DEFINER para evitar la policy compleja sobre '
  'chatter_messages (que rompe Realtime). Caller debe ser el examiner '
  'de la sesión O tener global scope (admin/manager).';
