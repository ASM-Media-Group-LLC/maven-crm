-- RPC chatter_sessions_total_spent(): por cada sesión del user actual,
-- devuelve la suma del campo `price` de los mensajes role='system' con
-- msg_type='tip' o 'purchase'. Misma fórmula que chatterTotalSpent en el
-- ChatterPublicView, pero agregada por session_id para que el panel del
-- workspace lo muestre al lado de cada sesión.
--
-- SECURITY DEFINER + filtro por examiner_user_id = auth.uid() para
-- evitar RLS overhead y garantizar que solo se retornen sesiones del
-- user logueado.

CREATE OR REPLACE FUNCTION public.chatter_sessions_total_spent()
RETURNS TABLE (
  session_id text,
  total_spent numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cm.session_id,
    COALESCE(SUM(cm.price), 0) AS total_spent
  FROM public.chatter_messages cm
  JOIN public.chatter_sessions cs ON cs.id = cm.session_id
  WHERE cs.examiner_user_id = auth.uid()
    AND cm.role = 'system'
    AND cm.msg_type IN ('tip', 'purchase')
    AND cm.price IS NOT NULL
  GROUP BY cm.session_id;
$$;

GRANT EXECUTE ON FUNCTION public.chatter_sessions_total_spent() TO authenticated;
