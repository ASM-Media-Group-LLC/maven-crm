-- get_promo_month_comparison — compara DÍAS DE PROMO del tramo del mes actual
-- (día 1 → hoy) contra el MISMO TRAMO de un mes anterior (por defecto el mes pasado),
-- por creadora ACTIVA con manager. Cierra el hueco por el que el bot decía "el sistema
-- solo trackea el mes actual": el dato histórico SÍ está en promolog_entries; faltaba
-- una tool que lo exponga. Mismo criterio de "mismo tramo" que el ingreso en
-- get_manager_growth_feed (cap al último día del mes previo si fuese más corto).
create or replace function public.get_promo_month_comparison(
  p_tenant uuid,
  p_months_back int default 1,
  p_manager_name text default null
)
returns table (
  creator_id uuid, name text, instagram_handle text, manager_name text,
  current_from date, current_to date, prev_from date, prev_to date,
  window_days int, promo_days_current int, promo_days_prev int, delta int
)
language sql stable security definer set search_path = public as $$
  with bounds as (
    select
      date_trunc('month', current_date)::date as this_start,
      current_date as this_end,
      (date_trunc('month', current_date) - make_interval(months => p_months_back))::date as prev_start,
      least(
        (date_trunc('month', current_date) - make_interval(months => p_months_back))::date
          + (current_date - date_trunc('month', current_date)::date),
        (date_trunc('month', current_date) - make_interval(months => p_months_back)
          + interval '1 month' - interval '1 day')::date
      ) as prev_cutoff
  ),
  active_models as (
    select c.id, coalesce(nullif(c.artistic_name,''), c.name) as name, c.instagram_handle,
           m.full_name as manager_name
    from creators c
    left join profiles m on m.id = c.assigned_manager_profile_id
    where c.status = 'active' and c.assigned_manager_profile_id is not null
      and (p_manager_name is null or m.full_name ilike '%' || p_manager_name || '%')
  ),
  promo as (
    select e.creator_id,
      count(distinct e.date::date) filter (
        where e.promoted in ('true','yes') and e.date::date >= b.this_start and e.date::date <= b.this_end
      ) as cur_days,
      count(distinct e.date::date) filter (
        where e.promoted in ('true','yes') and e.date::date >= b.prev_start and e.date::date <= b.prev_cutoff
      ) as prev_days
    from promolog_entries e cross join bounds b
    where e.tenant_id = p_tenant and e.date::date >= b.prev_start
    group by e.creator_id
  )
  select a.id, a.name, a.instagram_handle, a.manager_name,
         b.this_start, b.this_end, b.prev_start, b.prev_cutoff,
         (b.prev_cutoff - b.prev_start + 1) as window_days,
         coalesce(p.cur_days, 0)::int, coalesce(p.prev_days, 0)::int,
         (coalesce(p.cur_days, 0) - coalesce(p.prev_days, 0))::int as delta
  from active_models a
  cross join bounds b
  left join promo p on p.creator_id = a.id
  order by (coalesce(p.cur_days, 0) - coalesce(p.prev_days, 0)) asc, a.name;  -- mayores caídas primero
$$;

revoke all on function public.get_promo_month_comparison(uuid, int, text) from public, anon;
grant execute on function public.get_promo_month_comparison(uuid, int, text) to authenticated, service_role;

notify pgrst, 'reload schema';
