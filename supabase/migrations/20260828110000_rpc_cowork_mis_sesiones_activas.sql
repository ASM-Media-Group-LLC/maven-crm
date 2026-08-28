-- "Tus sesiones activas" en UN solo viaje de red.
--
-- El front lo armaba con cinco consultas encadenadas —getUser, mis membresias,
-- las sesiones, TODAS las membresias para contar, y mis asignaciones— y cada
-- una esperaba a la anterior. En la base cada una tarda ~2 ms; lo que se siente
-- es la ida y vuelta, seis veces, antes de poder dibujar nada.
--
-- SECURITY INVOKER: sigue respetando las RLS de cada tabla, no las esquiva. Lo
-- unico que cambia es que el encadenado ocurre del lado del servidor.

CREATE OR REPLACE FUNCTION public.cowork_mis_sesiones_activas()
RETURNS TABLE (
  id uuid, name text, description text, role text,
  members integer, created_at timestamptz, last_room_id uuid
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH mias AS (
    SELECT m.session_id, m.role
    FROM public.cowork_memberships m
    WHERE m.user_id = auth.uid()
  )
  SELECT
    s.id, s.name, s.description, mias.role,
    (SELECT count(*)::integer FROM public.cowork_memberships t WHERE t.session_id = s.id),
    s.created_at,
    -- La ultima sala donde estuvo, activa o no: es lo que hace que "Volver"
    -- lo devuelva a su puesto en vez de dejarlo esperando una asignacion.
    (SELECT a.room_id FROM public.cowork_room_assignments a
      WHERE a.session_id = s.id AND a.user_id = auth.uid()
      ORDER BY a.assigned_at DESC LIMIT 1)
  FROM mias
  JOIN public.cowork_sessions s ON s.id = mias.session_id AND s.status = 'active'
  ORDER BY s.created_at DESC;
$$;

COMMENT ON FUNCTION public.cowork_mis_sesiones_activas() IS
  'Sesiones de Cowork activas del usuario, con su rol, cuantos miembros tiene y su ultima sala. Reemplaza cinco consultas encadenadas desde el front: la demora no era la base (~2 ms cada una) sino los viajes de red en serie.';
