-- Anomalías de actividad de chatters (Hubstaff #7). Días "raros" que merecen una mirada,
-- derivados de hubstaff_daily_data (sin endpoints nuevos):
--   baja_actividad : >=2h trabajadas pero <35% de actividad (online pero casi sin teclear/mouse).
--   dia_corto      : <2.5h trabajadas en un día (apareció poco / abandonó temprano).
--   dia_largo      : >12h trabajadas (posible tiempo manual / error / sobrecarga).
-- Una fila por (chatter, día) anómalo, con el tipo más relevante (prioridad: baja_actividad > largo > corto).
-- security_invoker → RLS management de chatter_performance + hubstaff_daily_data.
create or replace view public.v_chatter_anomalies
with (security_invoker = true) as
with d as (
  select
    cp.blu_employee_id,
    cp.name,
    date_trunc('month', dd.date)::date as period,
    dd.date,
    round(dd.tracked_seconds / 3600.0, 1) as hours,
    dd.overall_activity                    as act
  from public.hubstaff_daily_data dd
  join public.hubstaff_members hm on hm.hubstaff_user_id = dd.hubstaff_user_id
  join public.chatter_performance cp
    on lower(btrim(cp.email)) = lower(btrim(hm.email)) and cp.is_chatter = true
  where dd.tracked_seconds > 0
    and cp.blu_employee_id is not null
    and public.has_role(hm.profile_id, 'Chatter')
)
select
  blu_employee_id, name, period, date, hours, act,
  case
    when hours >= 2 and act < 35 then 'baja_actividad'
    when hours > 12              then 'dia_largo'
    else                              'dia_corto'
  end as tipo
from d
where (hours >= 2 and act < 35) or hours > 12 or hours < 2.5;

grant select on public.v_chatter_anomalies to authenticated;
