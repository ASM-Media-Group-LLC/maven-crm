-- get_manager_growth_feed v2 — cambia la comparación de INGRESO de "7d vs 7d previos"
-- a "MES A LA FECHA vs MISMO TRAMO DEL MES PASADO" (pedido del owner): si hoy es 8,
-- compara el acumulado del 1→8 de este mes contra el 1→8 del mes pasado; si es 15,
-- 1→15 vs 1→15. Más estable para ingresos de OF (que se piensan por mes).
--
-- Renombra income_7d/income_prev7d → income_mtd/income_prev_mtd (los consumidores
-- —promolog-manager-tick y el tool managers— se actualizan a la par). El resto de la
-- lógica (cuadrantes promo×ingreso, promo window 14d, umbral de caída) se mantiene.
drop function if exists public.get_manager_growth_feed(uuid, int, int, numeric);
create function public.get_manager_growth_feed(
  p_tenant uuid,
  p_promo_window int default 14,
  p_low_promo_days int default 4,
  p_income_drop_pct numeric default 15
)
returns table (
  creator_id uuid, name text, instagram_handle text, category text,
  manager_profile_id uuid, manager_name text, manager_phone text,
  promo_days int, covered_days int,
  income_mtd numeric, income_prev_mtd numeric, income_trend_pct numeric, mtd_day int,
  quadrant text, priority int, diagnosis text
)
language sql stable security definer set search_path = public as $$
  with bounds as (
    -- límites de mes-a-la-fecha (MTD) vs mismo tramo del mes pasado.
    select
      date_trunc('month', current_date)::date as this_start,
      (current_date - date_trunc('month', current_date)::date) as days_elapsed,  -- 0 el día 1
      (date_trunc('month', current_date) - interval '1 month')::date as prev_start,
      -- cutoff del mes pasado = prev_start + días transcurridos, SIN pasarse del último
      -- día del mes pasado (ej. hoy 31 y el mes pasado tuvo 30 → capa en el 30).
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
    select creator_id,
      count(distinct date::date) filter (where promoted in ('true','yes')) as promo_days,
      count(distinct date::date) filter (where coalesce(error_reason,'') <> 'scrape_no_media') as covered_days
    from promolog_entries
    where tenant_id = p_tenant and date >= (current_date - p_promo_window)::timestamptz
    group by creator_id
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
      coalesce(p.promo_days,0) as promo_days, coalesce(p.covered_days,0) as covered_days,
      coalesce(i.income_mtd,0) as income_mtd, coalesce(i.income_prev_mtd,0) as income_prev_mtd,
      (coalesce(p.promo_days,0) < p_low_promo_days) as low_promo,
      (coalesce(i.income_prev_mtd,0) > 0 and coalesce(i.income_mtd,0) < coalesce(i.income_prev_mtd,0) * (1 - p_income_drop_pct/100.0)) as income_down,
      case when coalesce(i.income_prev_mtd,0) > 0
           then round(((coalesce(i.income_mtd,0) - i.income_prev_mtd) / i.income_prev_mtd * 100)::numeric)
           else null end as income_trend_pct
    from active_models a
    left join profiles m on m.id = a.mgr
    left join promo p on p.creator_id = a.id
    left join inc i on i.creator_id = a.id
  )
  select s.id, s.name, s.instagram_handle, s.category, s.mgr, s.manager_name, s.manager_phone,
    s.promo_days, s.covered_days, s.income_mtd, s.income_prev_mtd, s.income_trend_pct,
    extract(day from current_date)::int as mtd_day,
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
        format('Promociona %s/%s días y sus ingresos del mes caen %s%% (mes a la fecha $%s vs $%s al día %s del mes pasado) → empujar promo YA',
               s.promo_days, p_promo_window, abs(s.income_trend_pct), round(s.income_mtd), round(s.income_prev_mtd), extract(day from current_date)::int)
      when (not s.low_promo) and s.income_down then
        format('Promociona bien (%s/%s días) pero sus ingresos del mes caen %s%% (mes a la fecha vs mismo tramo del mes pasado) → revisar CALIDAD/estrategia de la promo',
               s.promo_days, p_promo_window, abs(s.income_trend_pct))
      when s.low_promo and (not s.income_down) then
        format('Promociona poco (%s/%s días) — ingreso del mes aún ok, pero riesgo a futuro → sumar promo/otra red',
               s.promo_days, p_promo_window)
      else 'Sana' end as diagnosis
  from scored s
  where not (s.low_promo = false and s.income_down = false)
  order by priority, s.income_mtd desc;
$$;

revoke all on function public.get_manager_growth_feed(uuid, int, int, numeric) from public, anon;
grant execute on function public.get_manager_growth_feed(uuid, int, int, numeric) to authenticated, service_role;
notify pgrst, 'reload schema';
