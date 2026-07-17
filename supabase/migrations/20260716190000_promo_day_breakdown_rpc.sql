-- get_promo_day_breakdown — CREADORAS que promocionaron OF en UN DÍA (default hoy,
-- Bogotá), por manager. Cierra el hueco por el que el bot decía "solo tengo el acumulado
-- del mes, no el desglose por día" cuando Luis preguntó "cuántas promociones hubo HOY".
--
-- ⚠️ CRITERIO (corregido con feedback del owner):
--   · "cuántas promociones" = cuántas CREADORAS promocionaron (NO cantidad de stories/entries).
--   · "promocionó" = tiene al menos una entry con promoted='true' ese día (promo OF detectada).
--     NO usar story_count>0 (eso es "tuvo stories", aunque no promocionara OF), ni contar filas
--     crudas (hay varias por creadora → infla). Los valores de promoted son 'true'/'false'/'pending'
--     (pending = scan con error, sin determinar → NO cuenta).
--
-- Devuelve UNA FILA POR CREADORA que promocionó (con cuántas stories de promo y en qué redes,
-- como detalle). El conteo por manager = cantidad de filas por manager.
create or replace function public.get_promo_day_breakdown(
  p_tenant uuid,
  p_date date default null,
  p_manager_name text default null
)
returns table (
  manager_name text,
  creator_id uuid,
  handle text,
  promo_stories int,
  networks text
)
language sql stable security definer set search_path = public as $$
  with d as (
    select coalesce(p_date, (now() at time zone 'America/Bogota')::date) as day
  )
  select
    m.full_name as manager_name,
    c.id as creator_id,
    coalesce(nullif(c.instagram_handle,''), nullif(c.artistic_name,''), c.name) as handle,
    count(*)::int as promo_stories,
    nullif(string_agg(distinct lower(coalesce(e.network, e.platform, '')), ', ') filter (
      where coalesce(e.network, e.platform, '') <> ''
    ), '') as networks
  from promolog_entries e
  cross join d
  join creators c on c.id = e.creator_id and c.status = 'active'
  left join profiles m on m.id = c.assigned_manager_profile_id
  where e.tenant_id = p_tenant
    and e.date::date = d.day
    and e.promoted = 'true'                       -- SOLO promo OF detectada (no false ni pending)
    and (p_manager_name is null or m.full_name ilike '%' || p_manager_name || '%')
  group by m.full_name, c.id, c.instagram_handle, c.artistic_name, c.name
  order by m.full_name nulls last, promo_stories desc;
$$;

revoke all on function public.get_promo_day_breakdown(uuid, date, text) from public, anon;
grant execute on function public.get_promo_day_breakdown(uuid, date, text) to authenticated, service_role;

notify pgrst, 'reload schema';
