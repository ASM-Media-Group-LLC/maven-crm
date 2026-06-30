-- Honestidad de cobertura del ROI por chatter. El ingreso solo cuenta ventas REGISTRADAS en BLU;
-- un chatter con muchas horas y $0 de venta BLU casi siempre es falta de datos, NO que no venda.
-- Marcarlo "no rentable" sería injusto.
--
-- Cambios sobre v_chatter_hubstaff_effort:
--   - nueva col `sin_venta_blu` = (no hay venta registrada en BLU) → la UI lo muestra como
--     "sin venta BLU", NO como veredicto de rendimiento.
--   - `no_rentable` ahora exige venta BLU > 0 (solo se juzga rentabilidad de quien SÍ tiene datos).
create or replace view public.v_chatter_hubstaff_effort
with (security_invoker = true) as
select
  h.blu_employee_id,
  h.name,
  h.period,
  h.days_tracked,
  h.total_hours,
  h.avg_activity_pct,
  round(coalesce(cp.total_sales, 0))::int                            as sales,
  round(coalesce(cp.total_sales, 0) / nullif(h.total_hours, 0))::int as sales_per_hour,
  round(cp.avg_response_seconds / 60.0)::int                         as avg_response_min,
  cp.unlock_rate,
  cp.sold_messages,
  cp.fans_chatted,
  (h.total_hours >= 25 and h.avg_activity_pct >= 50
     and round(coalesce(cp.total_sales,0) / nullif(h.total_hours,0)) < 15) as online_improductivo,
  round(cfg.base_salary_cop / nullif(cfg.fx_cop_per_usd, 0))::int     as cost_usd,
  round(coalesce(cp.total_sales,0) * cfg.of_net_factor
        * cfg.effective_agency_rate / 100.0)::int                    as agency_revenue_usd,
  round(coalesce(cp.total_sales,0) * cfg.of_net_factor * cfg.effective_agency_rate / 100.0
        - cfg.base_salary_cop / nullif(cfg.fx_cop_per_usd, 0))::int  as margin_usd,
  round((coalesce(cp.total_sales,0) * cfg.of_net_factor * cfg.effective_agency_rate / 100.0)
        / nullif(cfg.base_salary_cop / nullif(cfg.fx_cop_per_usd, 0), 0), 2) as roi_x,
  -- "no rentable" SOLO si hay venta BLU > 0 y aun así la tajada de la agencia < costo.
  (coalesce(cp.total_sales,0) > 0
     and (coalesce(cp.total_sales,0) * cfg.of_net_factor * cfg.effective_agency_rate / 100.0)
         < cfg.base_salary_cop / nullif(cfg.fx_cop_per_usd, 0))      as no_rentable,
  cfg.effective_agency_rate                                          as agency_rate_used,
  -- sin venta registrada en BLU → ingreso no capturado (probablemente trabaja en Infloww).
  (coalesce(cp.total_sales,0) = 0)                                   as sin_venta_blu
from public.v_chatter_hubstaff_monthly h
join public.chatter_performance cp on cp.blu_employee_id = h.blu_employee_id
left join public.chatter_cost_config cfg on cfg.id = true;

grant select on public.v_chatter_hubstaff_effort to authenticated;
