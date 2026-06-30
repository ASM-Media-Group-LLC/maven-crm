-- Esfuerzo de chatters (horas/actividad/días) re-agregado por RANGO DE FECHAS arbitrario
-- desde hubstaff_daily_data, para el "calendario de movimiento" del subtab Productividad.
-- La vista v_chatter_hubstaff_effort agrega por MES (date_trunc); esta función deja elegir
-- cualquier [from,to]. Solo esfuerzo: ventas/costo/ROI siguen siendo del snapshot mensual de BLU.
-- security invoker → respeta RLS de las tablas base (management).
create or replace function public.get_chatter_effort_range(p_from date, p_to date)
returns table(
  blu_employee_id integer,
  name text,
  days_tracked bigint,
  total_hours numeric,
  avg_activity_pct integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    cp.blu_employee_id,
    cp.name,
    count(*) as days_tracked,
    round(sum(d.tracked_seconds)::numeric / 3600.0, 1) as total_hours,
    round(avg(d.overall_activity))::integer as avg_activity_pct
  from hubstaff_daily_data d
    join hubstaff_members hm on hm.hubstaff_user_id = d.hubstaff_user_id
    join chatter_performance cp on lower(btrim(cp.email)) = lower(btrim(hm.email)) and cp.is_chatter = true
  where d.tracked_seconds > 0
    and cp.blu_employee_id is not null
    and has_role(hm.profile_id, 'Chatter'::text)
    and d.date >= p_from and d.date <= p_to
  group by cp.blu_employee_id, cp.name;
$$;

grant execute on function public.get_chatter_effort_range(date, date) to authenticated;
