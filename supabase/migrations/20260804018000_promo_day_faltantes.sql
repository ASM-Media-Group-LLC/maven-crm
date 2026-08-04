-- Aplicado vía MCP (04/08). "¿Cuáles de MIS creadoras faltan por promocionar?"
-- (Fabiana, 11:05) no era respondible: get_promo_day_breakdown solo devuelve las
-- que SÍ promocionaron. Este RPC devuelve el complemento respetando la doctrina
-- de cobertura (#956): 'leida_sin_promo' (el scan la revisó, sin promo — eso sí
-- se afirma) vs 'sin_leer' (el scan no llegó — de esa NO se dice "no promocionó").
-- La tool get_promo_day_breakdown lo llama en la misma corrida y lo devuelve como
-- faltan_por_manager (una sola llamada = amigable con el presupuesto de pared).
create or replace function public.get_promo_day_faltantes(p_tenant uuid, p_date date default null, p_manager_name text default null)
returns table(manager_name text, creadora text, estado text)
language sql stable security definer
set search_path to 'public'
as $$
  with d as (
    select coalesce(p_date, (now() at time zone 'America/Bogota')::date) as day
  ),
  hoy as (
    select e.creator_id,
           bool_or(e.promoted = 'true') as promo,
           bool_or(e.promoted = 'false') as leida
    from promolog_entries e cross join d
    where e.tenant_id = p_tenant and e.dia = d.day
    group by e.creator_id
  )
  select
    m.full_name as manager_name,
    coalesce(nullif(c.artistic_name,''), nullif(c.instagram_handle,''), c.name) as creadora,
    case when coalesce(h.leida, false) then 'leida_sin_promo' else 'sin_leer' end as estado
  from creators c
  left join profiles m on m.id = c.assigned_manager_profile_id
  left join hoy h on h.creator_id = c.id
  where c.status = 'active'
    and not coalesce(h.promo, false)
    and (p_manager_name is null or m.full_name ilike '%' || p_manager_name || '%')
  order by m.full_name nulls last, estado, creadora;
$$;
