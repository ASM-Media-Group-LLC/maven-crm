-- El ranking del scan de IG mataba a las cuentas SECUNDARIAS.
--
-- promolog_ig_scan_state_today agrupaba por creator_id SOLO. scan-targets usa ese
-- estado para ordenar la cola: creadora no escaneada hoy = rank 0 (primero), con
-- resultado definitivo = rank 2 (último). Como el rank era por creadora, apenas la
-- cuenta PRINCIPAL daba un resultado definitivo, TODA la creadora pasaba a rank 2 —
-- y su 2ª/3ª cuenta de IG (mismo creator_id) heredaba ese rank y se iba al fondo de
-- la cola todos los días. La extensión se queda sin presupuesto antes de llegar al
-- fondo → la cuenta secundaria NUNCA se escaneaba.
-- Caso real (Fabiana, 30/07): Yeseniaof tiene su 2ª IG yessca2of registrada, activa,
-- elegible y con su ig_user_id resuelto — y CERO filas de por vida en promolog_entries.
--
-- Fix: el estado ahora es por (creator_id, source_handle). Así cada handle rankea por
-- SU propio estado: una secundaria no escaneada hoy vuelve a rank 0 (prioridad) aunque
-- la principal ya esté lista. No afecta a las principales (siguen rankeando por lo suyo).
-- (DROP primero: cambia la firma — se agrega la columna source_handle al retorno.)
DROP FUNCTION IF EXISTS public.promolog_ig_scan_state_today();

CREATE OR REPLACE FUNCTION public.promolog_ig_scan_state_today()
 RETURNS TABLE(creator_id uuid, source_handle text, has_definitive boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.creator_id,
         lower(e.source_handle) as source_handle,
         bool_or(e.promoted in ('true','false')) as has_definitive
  from promolog_entries e
  where lower(e.network) = 'instagram'
    and e.creator_id is not null
    and e.source_handle is not null
    and (e.date at time zone 'America/New_York')::date
        = (now() at time zone 'America/New_York')::date
  group by e.creator_id, lower(e.source_handle);
$function$;
