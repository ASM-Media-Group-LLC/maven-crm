-- Los ADMIN ven TODAS las sesiones Cowork activas, no solo las suyas.
--
-- El landing de Cowork lista "Tus sesiones activas" via cowork_mis_sesiones_activas
-- (SECURITY INVOKER: solo donde sos miembro). Un admin necesita el mapa completo
-- de la operación: qué sesiones hay abiertas, de quién y con cuánta gente.
--
-- SECURITY DEFINER porque el admin NO es miembro de esas sesiones y las RLS no
-- lo dejarían leerlas. La guarda va ADENTRO: sin rol admin devuelve cero filas.
CREATE OR REPLACE FUNCTION public.cowork_sesiones_activas_admin()
RETURNS TABLE (
  id uuid, name text, description text,
  members integer, rooms integer, created_at timestamptz,
  host_name text, my_role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    s.id, s.name, s.description,
    (SELECT count(*)::integer FROM public.cowork_memberships m WHERE m.session_id = s.id),
    (SELECT count(*)::integer FROM public.cowork_rooms r WHERE r.session_id = s.id),
    s.created_at,
    (SELECT p.full_name FROM public.profiles p WHERE p.id = s.created_by),
    -- Si el admin ya es miembro, su rol: el front usa esto para no duplicar
    -- las sesiones que ya salen en "Tus sesiones activas".
    (SELECT m.role FROM public.cowork_memberships m
      WHERE m.session_id = s.id AND m.user_id = auth.uid() LIMIT 1)
  FROM public.cowork_sessions s
  WHERE s.status = 'active'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  ORDER BY s.created_at DESC;
$$;

COMMENT ON FUNCTION public.cowork_sesiones_activas_admin() IS
  'TODAS las sesiones Cowork activas (solo para rol admin; para otros devuelve cero filas). Con conteo de miembros/salas, nombre del creador y el rol propio si ya es miembro.';
