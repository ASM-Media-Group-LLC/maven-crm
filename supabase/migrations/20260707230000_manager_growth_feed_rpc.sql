-- get_manager_growth_feed — CEREBRO del bot supervisor de managers (distinto del
-- whatsapp-agent de closers/LLG). Por cada modelo ACTIVA con manager asignada,
-- cruza PROMO (Promolog, últimos p_promo_window días, respetando #818: excluye
-- scrape_no_media) × INGRESO (creator_daily_earnings, 7d vs 7d previos) y la ubica
-- en un cuadrante accionable, agrupando por su manager responsable:
--   critico : promociona poco + ingreso cae  → empujar promo YA
--   calidad : promociona bien + ingreso cae   → problema de CALIDAD/estrategia (promover MEJOR, no más)
--   riesgo  : promociona poco + ingreso ok     → riesgo a futuro (sumar promo)
--   sana    : promociona bien + ingreso ok     → no se reporta
-- Solo devuelve las accionables (critico/calidad/riesgo). Read-only, SECURITY
-- DEFINER. Lo consume el tick del supervisor (promolog-manager-tick) y (a futuro) Clari.
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
  income_7d numeric, income_prev7d numeric, income_trend_pct numeric,
  quadrant text, priority int, diagnosis text
)
language sql stable security definer set search_path = public as $$
  with active_models as (
    select c.id, coalesce(nullif(c.artistic_name,''), c.name) as name, c.instagram_handle,
           c.category, c.assigned_manager_profile_id as mgr
    from creators c
    where c.status = 'active' and c.assigned_manager_profile_id is not null
  ),
  promo as (
    -- días con promo (cualquier red) y días con data (no "sin datos") en la ventana
    select creator_id,
      count(distinct date::date) filter (where promoted in ('true','yes')) as promo_days,
      count(distinct date::date) filter (where coalesce(error_reason,'') <> 'scrape_no_media') as covered_days
    from promolog_entries
    where tenant_id = p_tenant and date >= (current_date - p_promo_window)::timestamptz
    group by creator_id
  ),
  inc as (
    select creator_id,
      coalesce(sum(total_gross) filter (where date >= current_date - 7), 0) as income_7d,
      coalesce(sum(total_gross) filter (where date >= current_date - 14 and date < current_date - 7), 0) as income_prev7d
    from creator_daily_earnings
    where date >= current_date - 14
    group by creator_id
  ),
  scored as (
    select a.id, a.name, a.instagram_handle, a.category, a.mgr,
      m.full_name as manager_name, m.phone_e164 as manager_phone,
      coalesce(p.promo_days,0) as promo_days, coalesce(p.covered_days,0) as covered_days,
      coalesce(i.income_7d,0) as income_7d, coalesce(i.income_prev7d,0) as income_prev7d,
      (coalesce(p.promo_days,0) < p_low_promo_days) as low_promo,
      (coalesce(i.income_prev7d,0) > 0 and coalesce(i.income_7d,0) < coalesce(i.income_prev7d,0) * (1 - p_income_drop_pct/100.0)) as income_down,
      case when coalesce(i.income_prev7d,0) > 0
           then round(((coalesce(i.income_7d,0) - i.income_prev7d) / i.income_prev7d * 100)::numeric)
           else null end as income_trend_pct
    from active_models a
    left join profiles m on m.id = a.mgr
    left join promo p on p.creator_id = a.id
    left join inc i on i.creator_id = a.id
  )
  select s.id, s.name, s.instagram_handle, s.category, s.mgr, s.manager_name, s.manager_phone,
    s.promo_days, s.covered_days, s.income_7d, s.income_prev7d, s.income_trend_pct,
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
        format('Promociona %s/%s días y sus ingresos caen %s%% (7d $%s vs $%s) → empujar promo YA',
               s.promo_days, p_promo_window, abs(s.income_trend_pct), round(s.income_7d), round(s.income_prev7d))
      when (not s.low_promo) and s.income_down then
        format('Promociona bien (%s/%s días) pero sus ingresos caen %s%% → revisar CALIDAD/estrategia de la promo',
               s.promo_days, p_promo_window, abs(s.income_trend_pct))
      when s.low_promo and (not s.income_down) then
        format('Promociona poco (%s/%s días) — ingreso aún ok, pero riesgo a futuro → sumar promo/otra red',
               s.promo_days, p_promo_window)
      else 'Sana' end as diagnosis
  from scored s
  where not (s.low_promo = false and s.income_down = false)   -- excluir "sana"
  order by priority, s.income_7d desc;
$$;

revoke all on function public.get_manager_growth_feed(uuid, int, int, numeric) from public, anon;
grant execute on function public.get_manager_growth_feed(uuid, int, int, numeric) to authenticated, service_role;
notify pgrst, 'reload schema';
