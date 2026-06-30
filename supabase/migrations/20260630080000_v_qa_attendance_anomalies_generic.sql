-- Vistas genéricas de Hubstaff por ROL QA (Chatter/closer/manager/LLG) → estandarizan
-- Asistencia y Anomalías en los 4 QA. Rol único por miembro (prioridad), vía has_role
-- (SECURITY DEFINER → sin choque con RLS de user_roles). security_invoker → hereda RLS
-- management de hubstaff_daily_data. NO depende de chatter_performance (sirve para todo rol).
-- Reemplazan a v_chatter_attendance / v_chatter_anomalies (que quedan sin uso).

create or replace view public.v_qa_attendance
with (security_invoker = true) as
with mem as (
  select hm.hubstaff_user_id, hm.name,
    case when public.has_role(hm.profile_id,'Chatter') then 'Chatter'
         when public.has_role(hm.profile_id,'closer')  then 'closer'
         when public.has_role(hm.profile_id,'manager') then 'manager'
         when public.has_role(hm.profile_id,'LLG')     then 'LLG' end as role
  from public.hubstaff_members hm
  where hm.profile_id is not null
    and (public.has_role(hm.profile_id,'Chatter') or public.has_role(hm.profile_id,'closer')
         or public.has_role(hm.profile_id,'manager') or public.has_role(hm.profile_id,'LLG'))
),
base as (
  select m.hubstaff_user_id, m.name, m.role,
    date_trunc('month', d.date)::date as period, d.date,
    (extract(hour   from (d.first_activity_at at time zone 'America/Bogota')) * 60
     + extract(minute from (d.first_activity_at at time zone 'America/Bogota')))::int as mod
  from mem m
  join public.hubstaff_daily_data d on d.hubstaff_user_id = m.hubstaff_user_id
  where d.first_activity_at is not null
),
perday as (
  select *, case
    when least(mod,1440-mod) <= abs(mod-480) and least(mod,1440-mod) <= abs(mod-960) then 0
    when abs(mod-480) <= abs(mod-960) then 480 else 960 end as nearest_shift
  from base
),
shift_rank as (
  select hubstaff_user_id, role, period, nearest_shift,
    row_number() over (partition by hubstaff_user_id, role, period order by count(*) desc, nearest_shift) as rn
  from perday group by hubstaff_user_id, role, period, nearest_shift
),
cs as (select hubstaff_user_id, role, period, nearest_shift as shift_start from shift_rank where rn = 1),
perday2 as (
  select p.*, cs.shift_start, (((p.mod - cs.shift_start + 720) % 1440) - 720) as dev
  from perday p join cs on cs.hubstaff_user_id=p.hubstaff_user_id and cs.role=p.role and cs.period=p.period
)
select hubstaff_user_id, name, role, period, shift_start,
  case shift_start when 0 then 'Madrugada · 12am–8am' when 480 then 'Mañana · 8am–4pm' when 960 then 'Tarde · 4pm–12am' end as turno,
  count(*) as dias,
  ((shift_start + round(avg(dev))::int) % 1440 + 1440) % 1440 as checkin_prom_min,
  count(*) filter (where dev > 10) as tardanzas,
  round(100.0 * count(*) filter (where dev <= 10) / count(*))::int as pct_a_tiempo,
  round(avg(dev) filter (where dev > 10))::int as min_tarde_prom
from perday2
group by hubstaff_user_id, name, role, period, shift_start;

grant select on public.v_qa_attendance to authenticated;

create or replace view public.v_qa_anomalies
with (security_invoker = true) as
with mem as (
  select hm.hubstaff_user_id, hm.name,
    case when public.has_role(hm.profile_id,'Chatter') then 'Chatter'
         when public.has_role(hm.profile_id,'closer')  then 'closer'
         when public.has_role(hm.profile_id,'manager') then 'manager'
         when public.has_role(hm.profile_id,'LLG')     then 'LLG' end as role
  from public.hubstaff_members hm
  where hm.profile_id is not null
    and (public.has_role(hm.profile_id,'Chatter') or public.has_role(hm.profile_id,'closer')
         or public.has_role(hm.profile_id,'manager') or public.has_role(hm.profile_id,'LLG'))
),
d as (
  select m.hubstaff_user_id, m.name, m.role,
    date_trunc('month', dd.date)::date as period, dd.date,
    round(dd.tracked_seconds/3600.0,1) as hours, dd.overall_activity as act
  from mem m join public.hubstaff_daily_data dd on dd.hubstaff_user_id = m.hubstaff_user_id
  where dd.tracked_seconds > 0
)
select hubstaff_user_id, name, role, period, date, hours, act,
  case
    when role in ('Chatter','LLG') and hours >= 2 and act < 35 then 'baja_actividad'
    when hours > 12 then 'dia_largo'
    else 'dia_corto'
  end as tipo
from d
-- baja_actividad solo para roles de escritorio (chatter/LLG); closers/managers están en llamadas.
where (role in ('Chatter','LLG') and hours >= 2 and act < 35) or hours > 12 or hours < 2.5;

grant select on public.v_qa_anomalies to authenticated;
