-- get_promo_day_breakdown: tres arreglos del 31/07.
--  1) `e.date::date` -> `e.dia` (día de Bogotá). Con el día UTC, el scan nocturno caía en
--     el día siguiente: a las 10:38 devolvió 5 creadoras "de hoy" escaneadas el 30 a las
--     23:19-23:25, cuando el scan del 31 recién arrancó 11:15.
--  2) promo_stories contaba FILAS (1 por scan), no stories → el bot decía "todas con
--     1 story" a creadoras con 3. story_count trae el número real; usamos el MÁXIMO del
--     día y no la suma porque un 2º scan del mismo día vuelve a ver las mismas (24h).
--  3) Devolvía solo el handle principal de `creators`: le contestó a Fabiana
--     "promocionó djsexybeatsoficial" cuando ella la gestiona como "Moramay", y encima la
--     promo salió en su cuenta SECUNDARIA (@solamente_moramay). Ahora van los tres.
-- Cambia la forma del RETURNS TABLE → hace falta DROP. Único consumidor: la tool del bot.
DROP FUNCTION IF EXISTS public.get_promo_day_breakdown(uuid, date, text);

CREATE FUNCTION public.get_promo_day_breakdown(p_tenant uuid, p_date date DEFAULT NULL::date, p_manager_name text DEFAULT NULL::text)
 RETURNS TABLE(manager_name text, creator_id uuid, creadora text, handle text, cuentas text, promo_stories integer, networks text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with d as (
    select coalesce(p_date, (now() at time zone 'America/Bogota')::date) as day
  )
  select
    m.full_name as manager_name,
    c.id as creator_id,
    coalesce(nullif(c.artistic_name,''), nullif(c.instagram_handle,''), c.name) as creadora,
    coalesce(nullif(c.instagram_handle,''), nullif(c.artistic_name,''), c.name) as handle,
    nullif(string_agg(distinct lower(coalesce(nullif(e.source_handle,''), '')), ', ') filter (
      where coalesce(e.source_handle,'') <> ''
    ), '') as cuentas,
    greatest(max(coalesce(e.story_count, 1)), 1)::int as promo_stories,
    nullif(string_agg(distinct lower(coalesce(e.network, e.platform, '')), ', ') filter (
      where coalesce(e.network, e.platform, '') <> ''
    ), '') as networks
  from promolog_entries e
  cross join d
  join creators c on c.id = e.creator_id and c.status = 'active'
  left join profiles m on m.id = c.assigned_manager_profile_id
  where e.tenant_id = p_tenant
    and e.dia = d.day
    and e.promoted = 'true'
    and (p_manager_name is null or m.full_name ilike '%' || p_manager_name || '%')
  group by m.full_name, c.id, c.instagram_handle, c.artistic_name, c.name
  order by m.full_name nulls last, promo_stories desc;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_promo_day_breakdown(uuid, date, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_promo_day_breakdown(uuid, date, text) TO authenticated, service_role;
