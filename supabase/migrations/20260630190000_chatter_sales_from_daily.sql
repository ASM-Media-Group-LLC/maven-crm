-- (A) v_chatter_hubstaff_effort: la VENTA sale del rollup mensual de chatter_daily_sales
-- (preserva historia, no se pisa en el rollover de mes) con fallback al snapshot mensual.
-- (B) get_chatter_sales_range: venta por rango de fechas para el calendario de Productividad.
create or replace view public.v_chatter_hubstaff_effort
with (security_invoker = true) as
with ds_month as (
  select blu_employee_id, date_trunc('month', date)::date as period, sum(total_sales) as sales
  from public.chatter_daily_sales group by 1, 2
)
select h.blu_employee_id, h.name, h.period, h.days_tracked, h.total_hours, h.avg_activity_pct,
  round(s.sales)::integer as sales,
  round(s.sales / nullif(h.total_hours, 0))::integer as sales_per_hour,
  round(cp.avg_response_seconds / 60.0)::integer as avg_response_min,
  cp.unlock_rate, cp.sold_messages, cp.fans_chatted,
  (h.total_hours >= 25 and h.avg_activity_pct >= 50 and round(s.sales / nullif(h.total_hours, 0)) < 15) as online_improductivo,
  round(cfg.base_salary_cop / nullif(cfg.fx_cop_per_usd, 0))::integer as cost_usd,
  round(s.sales * cfg.of_net_factor * cfg.effective_agency_rate / 100.0)::integer as agency_revenue_usd,
  round(s.sales * cfg.of_net_factor * cfg.effective_agency_rate / 100.0 - cfg.base_salary_cop / nullif(cfg.fx_cop_per_usd, 0))::integer as margin_usd,
  round(s.sales * cfg.of_net_factor * cfg.effective_agency_rate / 100.0 / nullif(cfg.base_salary_cop / nullif(cfg.fx_cop_per_usd, 0), 0), 2) as roi_x,
  (s.sales > 0 and (s.sales * cfg.of_net_factor * cfg.effective_agency_rate / 100.0) < (cfg.base_salary_cop / nullif(cfg.fx_cop_per_usd, 0))) as no_rentable,
  cfg.effective_agency_rate as agency_rate_used,
  (s.sales = 0) as sin_venta_blu
from public.v_chatter_hubstaff_monthly h
join public.chatter_performance cp on cp.blu_employee_id = h.blu_employee_id
left join public.chatter_cost_config cfg on cfg.id = true
left join ds_month on ds_month.blu_employee_id = h.blu_employee_id and ds_month.period = h.period
cross join lateral (select coalesce(ds_month.sales, cp.total_sales, 0)::numeric as sales) s;

grant select on public.v_chatter_hubstaff_effort to authenticated;

create or replace function public.get_chatter_sales_range(p_from date, p_to date)
returns table(
  blu_employee_id integer, name text, sales numeric,
  agency_revenue_usd integer, cost_usd integer, margin_usd integer, roi_x numeric, sin_venta_blu boolean
)
language sql stable security invoker set search_path = public as $$
  with cfg as (select fx_cop_per_usd fx, of_net_factor onf, effective_agency_rate rate, base_salary_cop base from public.chatter_cost_config limit 1),
  d as (select blu_employee_id, max(name) as name, sum(total_sales) as sales
        from public.chatter_daily_sales where date >= p_from and date <= p_to group by blu_employee_id),
  n as (select greatest((p_to - p_from + 1), 1)::numeric as ndays)
  select d.blu_employee_id, d.name, round(d.sales, 2) as sales,
    round(d.sales * c.onf * c.rate / 100.0)::integer as agency_revenue_usd,
    round((c.base / nullif(c.fx, 0)) * (n.ndays / 30.0))::integer as cost_usd,
    round(d.sales * c.onf * c.rate / 100.0 - (c.base / nullif(c.fx, 0)) * (n.ndays / 30.0))::integer as margin_usd,
    round((d.sales * c.onf * c.rate / 100.0) / nullif((c.base / nullif(c.fx, 0)) * (n.ndays / 30.0), 0), 2) as roi_x,
    (d.sales <= 0) as sin_venta_blu
  from d cross join cfg c cross join n;
$$;

grant execute on function public.get_chatter_sales_range(date, date) to authenticated;
