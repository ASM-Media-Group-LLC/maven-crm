-- Esfuerzo (Hubstaff) × Resultado (BLU) por chatter/mes. El hallazgo central: actividad% sola NO es
-- productividad → cruzando con ventas + tiempo de respuesta se detecta el "online pero improductivo".
-- security_invoker=true → respeta RLS (management-only) de las tablas base. chatter_performance es snapshot
-- del mes en curso (1 fila/chatter) → la vista sirve para el mes actual.
create or replace view public.v_chatter_hubstaff_effort
with (security_invoker = true) as
select
  h.blu_employee_id,
  h.name,
  h.period,
  h.days_tracked,
  h.total_hours,
  h.avg_activity_pct,
  round(coalesce(cp.total_sales, 0))::int                           as sales,
  round(coalesce(cp.total_sales, 0) / nullif(h.total_hours, 0))::int as sales_per_hour,
  round(cp.avg_response_seconds / 60.0)::int                        as avg_response_min,
  cp.unlock_rate,
  cp.sold_messages,
  cp.fans_chatted,
  -- flag heurístico: bastante esfuerzo (horas + actividad) pero poco resultado → revisar/coachear.
  (h.total_hours >= 25 and h.avg_activity_pct >= 50
     and round(coalesce(cp.total_sales,0) / nullif(h.total_hours,0)) < 15) as online_improductivo
from public.v_chatter_hubstaff_monthly h
join public.chatter_performance cp on cp.blu_employee_id = h.blu_employee_id;

grant select on public.v_chatter_hubstaff_effort to authenticated;
