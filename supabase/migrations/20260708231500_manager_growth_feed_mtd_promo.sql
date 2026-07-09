-- get_manager_growth_feed v3 — la PROMO también pasa a MES A LA FECHA (pedido del
-- owner): "promo X/N" donde N = día del mes (hoy 8 → X/8), no /14. El umbral de
-- "promociona poco" pasa de un absoluto (4 días) a un RATIO de los días transcurridos
-- (p_low_promo_rate, default 0.40 = promovió en <40% de los días del mes), con piso de
-- 3 días para no alertar por ruido a comienzo de mes. Ingreso ya era MTD (v2).
--
-- ⚠️ Los días de promo de ANTES de hoy en el mes reflejan el scan viejo de Apify
-- (subcontaba historias). Se corrigen solos a medida que corre el lector directo
-- (promolog-story-read) día a día.
drop function if exists public.get_manager_growth_feed(uuid, int, int, numeric);
drop function if exists public.get_manager_growth_feed(uuid, numeric, numeric);
create function public.get_manager_growth_feed(
  p_tenant uuid,
  p_low_promo_rate numeric default 0.40,
  p_income_drop_pct numeric default 15
)
returns table (
  creator_id uuid, name text, instagram_handle text, category text,
  manager_profile_id uuid, manager_name text, manager_phone text,
  promo_days int, covered_days int, mtd_day int,
  income_mtd numeric, income_prev_mtd numeric, income_trend_pct numeric,
  quadrant text, priority int, diagnosis text
)
language sql stable security definer set search_path = public as $$
  with bounds as (
    select
      date_trunc('month', current_date)::date as this_start,
      extract(day from current_date)::int as mtd_day,
      (date_trunc('month', current_date) - interval '1 month')::date as prev_start,
      least(
        (date_trunc('month', current_date) - interval '1 month')::date
          + (current_date - date_trunc('month', current_date)::date),
        date_trunc('month', current_date)::date - 1
      ) as prev_cutoff
  ),
  active_models as (
    select c.id, coalesce(nullif(c.artistic_name,''), c.name) as name, c.instagram_handle,
           c.category, c.assigned_manager_profile_id as mgr
    from creators c
    where c.status = 'active' and c.assigned_manager_profile_id is not null
  ),
  promo as (
    -- días con promo (cualquier red) MES A LA FECHA (desde el 1 del mes) + días con data.
    select e.creator_id,
      count(distinct e.date::date) filter (where e.promoted in ('true','yes')) as promo_days,
      count(distinct e.date::date) filter (where coalesce(e.error_reason,'') <> 'scrape_no_media') as covered_days
    from promolog_entries e cross join bounds b
    where e.tenant_id = p_tenant and e.date >= b.this_start::timestamptz
    group by e.creator_id
  ),
  inc as (
    select e.creator_id,
      coalesce(sum(e.total_gross) filter (where e.date >= b.this_start and e.date <= current_date), 0) as income_mtd,
      coalesce(sum(e.total_gross) filter (where e.date >= b.prev_start and e.date <= b.prev_cutoff), 0) as income_prev_mtd
    from creator_daily_earnings e cross join bounds b
    where e.date >= b.prev_start
    group by e.creator_id
  ),
  scored as (
    select a.id, a.name, a.instagram_handle, a.category, a.mgr,
      m.full_name as manager_name, m.phone_e164 as manager_phone,
      coalesce(p.promo_days,0) as promo_days, coalesce(p.covered_days,0) as covered_days, b.mtd_day,
      coalesce(i.income_mtd,0) as income_mtd, coalesce(i.income_prev_mtd,0) as income_prev_mtd,
      (b.mtd_day >= 3 and coalesce(p.promo_days,0) < p_low_promo_rate * b.mtd_day) as low_promo,
      (coalesce(i.income_prev_mtd,0) > 0 and coalesce(i.income_mtd,0) < coalesce(i.income_prev_mtd,0) * (1 - p_income_drop_pct/100.0)) as income_down,
      case when coalesce(i.income_prev_mtd,0) > 0
           then round(((coalesce(i.income_mtd,0) - i.income_prev_mtd) / i.income_prev_mtd * 100)::numeric)
           else null end as income_trend_pct
    from active_models a
    cross join bounds b
    left join profiles m on m.id = a.mgr
    left join promo p on p.creator_id = a.id
    left join inc i on i.creator_id = a.id
  )
  select s.id, s.name, s.instagram_handle, s.category, s.mgr, s.manager_name, s.manager_phone,
    s.promo_days, s.covered_days, s.mtd_day, s.income_mtd, s.income_prev_mtd, s.income_trend_pct,
    case when s.low_promo and s.income_down then 'critico'
         when (not s.low_promo) and s.income_down then 'calidad'
         when s.low_promo and (not s.income_down) then 'riesgo'
         else 'sana' end as quadrant,
    case when s.low_promo and s.income_down then 1
         when (not s.low_promo) and s.income_down then 2
         when s.low_promo and (not s.income_down) then 3
         else 4 end as priority,
    case
      when s.low_promo and s.income_down then
        format('Promociona %s/%s días este mes y sus ingresos caen %s%% (mes a la fecha $%s vs $%s al día %s del mes pasado) → empujar promo YA',
               s.promo_days, s.mtd_day, abs(s.income_trend_pct), round(s.income_mtd), round(s.income_prev_mtd), s.mtd_day)
      when (not s.low_promo) and s.income_down then
        format('Promociona bien (%s/%s días este mes) pero sus ingresos caen %s%% (mes a la fecha vs mismo tramo del mes pasado) → revisar CALIDAD/estrategia',
               s.promo_days, s.mtd_day, abs(s.income_trend_pct))
      when s.low_promo and (not s.income_down) then
        format('Promociona poco (%s/%s días este mes) — ingreso aún ok, pero riesgo a futuro → sumar promo/otra red',
               s.promo_days, s.mtd_day)
      else 'Sana' end as diagnosis
  from scored s
  where not (s.low_promo = false and s.income_down = false)
  order by priority, s.income_mtd desc;
$$;
revoke all on function public.get_manager_growth_feed(uuid, numeric, numeric) from public, anon;
grant execute on function public.get_manager_growth_feed(uuid, numeric, numeric) to authenticated, service_role;
notify pgrst, 'reload schema';
