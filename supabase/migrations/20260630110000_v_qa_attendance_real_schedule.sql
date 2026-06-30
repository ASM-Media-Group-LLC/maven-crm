-- Puntualidad contra el HORARIO REAL cargado (whatsapp_user_schedules: por persona × weekday),
-- con fallback al turno DEDUCIDO (cluster 8/16/0) cuando la persona no tiene horario cargado.
-- Resuelve closers + horarios variables por día. Mide la 1ª actividad de Hubstaff vs el inicio del
-- horario de ESE día. weekday = isodow (1=Lun..7=Dom). Append-only de la col `horario_cargado`.
create or replace view public.v_qa_attendance
with (security_invoker = true) as
with mem as (
  select hm.hubstaff_user_id, hm.profile_id, hm.name,
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
  select m.hubstaff_user_id, m.profile_id, m.name, m.role,
    date_trunc('month', d.date)::date as period, d.date,
    extract(isodow from d.date)::int as dow,
    (extract(hour from (d.first_activity_at at time zone 'America/Bogota')) * 60
     + extract(minute from (d.first_activity_at at time zone 'America/Bogota')))::int as mod
  from mem m
  join public.hubstaff_daily_data d on d.hubstaff_user_id = m.hubstaff_user_id
  where d.first_activity_at is not null
),
sched as (
  select user_id, weekday,
    (extract(hour from start_time) * 60 + extract(minute from start_time))::int as sched_start
  from public.whatsapp_user_schedules where start_time is not null
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
  select p.*, cs.shift_start as cluster_start,
    (s.sched_start is not null) as from_sched,
    (((p.mod - coalesce(s.sched_start, cs.shift_start) + 720) % 1440) - 720) as dev,
    (((p.mod - cs.shift_start + 720) % 1440) - 720) as dev_cluster
  from perday p
  left join cs on cs.hubstaff_user_id = p.hubstaff_user_id and cs.role = p.role and cs.period = p.period
  left join sched s on s.user_id = p.profile_id and s.weekday = p.dow
)
select
  hubstaff_user_id, name, role, period,
  max(cluster_start) as shift_start,
  case when bool_or(from_sched) then 'Según horario propio'
       when max(cluster_start) = 0   then 'Madrugada · 12am–8am'
       when max(cluster_start) = 480 then 'Mañana · 8am–4pm'
       else 'Tarde · 4pm–12am' end as turno,
  count(*) as dias,
  ((max(cluster_start) + round(avg(dev_cluster))::int) % 1440 + 1440) % 1440 as checkin_prom_min,
  count(*) filter (where dev > 10) as tardanzas,
  round(100.0 * count(*) filter (where dev <= 10) / count(*))::int as pct_a_tiempo,
  round(avg(dev) filter (where dev > 10))::int as min_tarde_prom,
  bool_or(from_sched) as horario_cargado
from perday2
group by hubstaff_user_id, name, role, period;

grant select on public.v_qa_attendance to authenticated;
