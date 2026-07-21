-- get_manager_growth_feed v4 — la ventana de INGRESO (BLU) se corta en el último día
-- LIQUIDADO, NO en current_date.
--
-- Bug: BLU importa intradía, así que HOY y AYER llegan parciales (medido 2026-07-21:
-- jul-20 = $18.477 (~60% de un día normal), jul-21 = $4.084 (~13%), vs ~$30k/día). El RPC
-- sumaba income_mtd hasta current_date (parcial) y lo comparaba contra un mes previo
-- COMPLETO al mismo día → caída inflada: agencia -20% y 47 en el radar cuando lo real
-- (ventana justa jul 1-19 vs jun 1-19) es ~-14% y bastantes menos flags.
--
-- Fix: inc_cutoff = último día liquidado (current_date - 2, nunca antes del día 1 del
-- mes). income_mtd y la ventana del mes previo (prev_cutoff) se alinean a ese día, y el
-- texto del diagnóstico cita ese día (income_day) para el ingreso.
--
-- La PROMO (promolog) se deja tal cual (hasta hoy, denominador mtd_day): NO tiene el lag
-- de BLU y recortarla flaggearía falsos "no promociona". Firma idéntica → CREATE OR
-- REPLACE (grants intactos). Ver [[manager_supervisor_bot]] + verificación BLU directa.

create or replace function public.get_manager_growth_feed(
  p_tenant uuid,
  p_low_promo_rate numeric default 0.40,
  p_income_drop_pct numeric default 15
)
returns table(
  creator_id uuid, name text, instagram_handle text, category text,
  manager_profile_id uuid, manager_name text, manager_phone text,
  promo_days integer, covered_days integer, mtd_day integer,
  income_mtd numeric, income_prev_mtd numeric, income_trend_pct numeric,
  quadrant text, priority integer, diagnosis text
)
language sql
stable security definer
set search_path to 'public'
as $function$
  with b0 as (
    select
      date_trunc('month', current_date)::date as this_start,
      extract(day from current_date)::int as mtd_day,
      -- INGRESO (BLU): último día LIQUIDADO. Hoy/ayer llegan parciales (~2 días de lag).
      -- Nunca antes del día 1 del mes en curso (early-month → ventana chica pero honesta).
      greatest(date_trunc('month', current_date)::date, current_date - 2)::date as inc_cutoff,
      (date_trunc('month', current_date) - interval '1 month')::date as prev_start
  ),
  bounds as (
    select
      this_start,
      mtd_day,
      inc_cutoff,
      extract(day from inc_cutoff)::int as income_day,
      prev_start,
      -- mismo día-del-mes que inc_cutoff, sin pasarse del último día del mes previo
      least(prev_start + (inc_cutoff - this_start), this_start - 1) as prev_cutoff
    from b0
  ),
  active_models as (
    select c.id, coalesce(nullif(c.artistic_name,''), c.name) as name, c.instagram_handle,
           c.category, c.assigned_manager_profile_id as mgr
    from creators c
    where c.status = 'active' and c.assigned_manager_profile_id is not null
  ),
  promo as (
    -- promolog NO tiene lag → se cuenta hasta hoy (denominador = mtd_day)
    select e.creator_id,
      count(distinct e.date::date) filter (where e.promoted in ('true','yes')) as promo_days,
      count(distinct e.date::date) filter (where coalesce(e.error_reason,'') <> 'scrape_no_media') as covered_days
    from promolog_entries e cross join bounds b
    where e.tenant_id = p_tenant and e.date >= b.this_start::timestamptz
    group by e.creator_id
  ),
  inc as (
    select e.creator_id,
      coalesce(sum(e.total_gross) filter (where e.date >= b.this_start and e.date <= b.inc_cutoff), 0) as income_mtd,
      coalesce(sum(e.total_gross) filter (where e.date >= b.prev_start and e.date <= b.prev_cutoff), 0) as income_prev_mtd
    from creator_daily_earnings e cross join bounds b
    where e.date >= b.prev_start
    group by e.creator_id
  ),
  scored as (
    select a.id, a.name, a.instagram_handle, a.category, a.mgr,
      m.full_name as manager_name, m.phone_e164 as manager_phone,
      coalesce(p.promo_days,0) as promo_days, coalesce(p.covered_days,0) as covered_days,
      b.mtd_day, b.income_day,
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
        format('Promociona %s/%s días este mes y sus ingresos caen %s%% (al día %s: $%s vs $%s el mes pasado) → empujar promo YA',
               s.promo_days, s.mtd_day, abs(s.income_trend_pct), s.income_day, round(s.income_mtd), round(s.income_prev_mtd))
      when (not s.low_promo) and s.income_down then
        format('Promociona bien (%s/%s días este mes) pero sus ingresos caen %s%% (al día %s vs mismo tramo del mes pasado) → revisar CALIDAD/estrategia',
               s.promo_days, s.mtd_day, abs(s.income_trend_pct), s.income_day)
      when s.low_promo and (not s.income_down) then
        format('Promociona poco (%s/%s días este mes) — ingreso aún ok, pero riesgo a futuro → sumar promo/otra red',
               s.promo_days, s.mtd_day)
      else 'Sana' end as diagnosis
  from scored s
  where not (s.low_promo = false and s.income_down = false)
  order by priority, s.income_mtd desc;
$function$;

revoke all on function public.get_manager_growth_feed(uuid, numeric, numeric) from public, anon;
grant execute on function public.get_manager_growth_feed(uuid, numeric, numeric) to authenticated, service_role;
