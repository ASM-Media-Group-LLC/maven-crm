-- Filtro "Agente" del pipeline de Closers: antes se armaba en el front con los
-- agentes presentes en la PÁGINA cargada (~50 filas), por lo que solo aparecían
-- 1-2 closers. Este RPC devuelve TODOS los agentes que tienen al menos un lead
-- asignado, independiente de la paginación.
CREATE OR REPLACE FUNCTION public.get_closer_agents()
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT cc.assigned_to AS id, coalesce(p.full_name, 'Sin nombre') AS name
  FROM public.closer_creators cc
  JOIN public.profiles p ON p.id = cc.assigned_to
  WHERE cc.assigned_to IS NOT NULL
  ORDER BY name
$function$;

GRANT EXECUTE ON FUNCTION public.get_closer_agents() TO authenticated;
