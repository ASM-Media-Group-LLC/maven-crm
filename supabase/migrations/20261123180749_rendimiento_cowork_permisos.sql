-- Resuelve la identidad una vez por consulta para que PostgreSQL use los índices
-- de usuario antes de evaluar los permisos de cada fila. Conserva SECURITY
-- INVOKER, las políticas RLS, los miembros y la última asignación (activa o no).
-- Incidente: 5.681 asignaciones recorridas; ~3 s frente a ~1 ms con índices.
CREATE OR REPLACE FUNCTION public.cowork_mis_sesiones_activas()
 RETURNS TABLE(id uuid, name text, description text, role text, members integer, created_at timestamp with time zone, last_room_id uuid, created_by uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH mias AS (
    SELECT m.session_id, m.role
    FROM public.cowork_memberships m
    WHERE m.user_id = (select auth.uid())
  )
  SELECT
    s.id, s.name, s.description, mias.role,
    (SELECT count(*)::integer FROM public.cowork_memberships t WHERE t.session_id = s.id),
    s.created_at,
    -- La ultima sala donde estuvo, activa o no: es lo que hace que "Volver"
    -- lo devuelva a su puesto en vez de dejarlo esperando una asignacion.
    (SELECT a.room_id FROM public.cowork_room_assignments a
      WHERE a.session_id = s.id AND a.user_id = (select auth.uid())
      ORDER BY a.assigned_at DESC LIMIT 1),
    s.created_by
  FROM mias
  JOIN public.cowork_sessions s ON s.id = mias.session_id AND s.status = 'active'
  ORDER BY s.created_at DESC;
$function$;
