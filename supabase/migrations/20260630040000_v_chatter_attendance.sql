-- Asistencia automática de chatters (Hubstaff #4). Deriva check-in y puntualidad de
-- hubstaff_daily_data.first_activity_at (1ª actividad del día, en hora Colombia) + el turno
-- deducido de cada chatter. NO usa la tabla `attendance` formal (keyeada a employees, hoy vacío);
-- es Hubstaff-nativa, como v_chatter_hubstaff_effort.
--
-- Turno por chatter = la MODA de sus inicios (cada día se asigna al turno más cercano de
-- 12am / 8am / 4pm en minutos circulares; el más frecuente del mes es "su" turno). Cada día se
-- mide contra ese turno fijo → desvío (dev>0 = tarde). Tolerancia 10 min (igual que el c1).
-- security_invoker → RLS management de las tablas base (chatter_performance + hubstaff_daily_data).
create or replace view public.v_chatter_attendance
with (security_invoker = true) as
with base as (
  select
    cp.blu_employee_id,
    cp.name,
    date_trunc('month', d.date)::date as period,
    d.date,
    (extract(hour   from (d.first_activity_at at time zone 'America/Bogota')) * 60
     + extract(minute from (d.first_activity_at at time zone 'America/Bogota')))::int as mod
  from public.hubstaff_daily_data d
  join public.hubstaff_members hm on hm.hubstaff_user_id = d.hubstaff_user_id
  join public.chatter_performance cp
    on lower(btrim(cp.email)) = lower(btrim(hm.email)) and cp.is_chatter = true
  where d.first_activity_at is not null
    and cp.blu_employee_id is not null
    and public.has_role(hm.profile_id, 'Chatter')
),
perday as (
  select *,
    case
      when least(mod, 1440 - mod) <= abs(mod - 480) and least(mod, 1440 - mod) <= abs(mod - 960) then 0
      when abs(mod - 480) <= abs(mod - 960) then 480
      else 960
    end as nearest_shift
  from base
),
shift_rank as (
  select blu_employee_id, period, nearest_shift,
         row_number() over (partition by blu_employee_id, period
                            order by count(*) desc, nearest_shift) as rn
  from perday
  group by blu_employee_id, period, nearest_shift
),
chatter_shift as (
  select blu_employee_id, period, nearest_shift as shift_start
  from shift_rank where rn = 1
),
perday2 as (
  select p.*, cs.shift_start,
    (((p.mod - cs.shift_start + 720) % 1440) - 720) as dev  -- minutos: >0 tarde, <0 temprano
  from perday p
  join chatter_shift cs on cs.blu_employee_id = p.blu_employee_id and cs.period = p.period
)
select
  blu_employee_id,
  name,
  period,
  shift_start,
  case shift_start
    when 0   then 'Madrugada · 12am–8am'
    when 480 then 'Mañana · 8am–4pm'
    when 960 then 'Tarde · 4pm–12am'
  end                                                                    as turno,
  count(*)                                                               as dias,
  -- check-in promedio (circular: turno + desvío promedio), en minutos desde medianoche.
  ((shift_start + round(avg(dev))::int) % 1440 + 1440) % 1440            as checkin_prom_min,
  count(*) filter (where dev > 10)                                       as tardanzas,
  round(100.0 * count(*) filter (where dev <= 10) / count(*))::int       as pct_a_tiempo,
  round(avg(dev) filter (where dev > 10))::int                           as min_tarde_prom
from perday2
group by blu_employee_id, name, period, shift_start;

grant select on public.v_chatter_attendance to authenticated;
