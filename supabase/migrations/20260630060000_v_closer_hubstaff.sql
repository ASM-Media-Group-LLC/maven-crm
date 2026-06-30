-- Esfuerzo (Hubstaff) × Cierre (pipeline + QA) por CLOSER. Análogo al de chatters pero el
-- "resultado" sale del pipeline de closers (closer_creators.assigned_to → monetización/cerradas)
-- y de las QA de llamadas (qa_calls.closer_id → score). OJO: la actividad% de un closer es BAJA
-- por naturaleza (está en llamadas, no tecleando) → se muestra como contexto, NO se la castiga.
-- security_invoker → RLS management de hubstaff_daily_data / closer_creators / qa_calls.
create or replace view public.v_closer_hubstaff
with (security_invoker = true) as
with cl as (
  select hm.profile_id, hm.name, hm.hubstaff_user_id
  from public.hubstaff_members hm
  where public.has_role(hm.profile_id, 'closer')
),
hs as (
  select cl.profile_id, cl.name,
    date_trunc('month', d.date)::date as period,
    count(*) as dias,
    round(sum(d.tracked_seconds) / 3600.0, 1) as total_hours,
    round(avg(d.overall_activity))::int as avg_activity_pct
  from cl
  join public.hubstaff_daily_data d on d.hubstaff_user_id = cl.hubstaff_user_id
  where d.tracked_seconds > 0
  group by cl.profile_id, cl.name, date_trunc('month', d.date)
),
pipe as (
  select assigned_to,
    count(*) as leads,
    count(*) filter (where stage in ('Confirmada','Completada')) as cerradas,
    round(coalesce(sum(monthly_monetization) filter (where stage in ('Confirmada','Completada')), 0))::int as monetizacion_usd
  from public.closer_creators
  where assigned_to is not null
  group by assigned_to
),
qa as (
  select closer_id, count(*) as qa_calls, round(avg(claude_score))::int as avg_qa_score
  from public.qa_calls
  where closer_id is not null
  group by closer_id
)
select
  hs.name,
  hs.period,
  hs.dias,
  hs.total_hours,
  hs.avg_activity_pct,
  coalesce(pipe.leads, 0)            as leads,
  coalesce(pipe.cerradas, 0)         as cerradas,
  coalesce(pipe.monetizacion_usd, 0) as monetizacion_usd,
  round(coalesce(pipe.monetizacion_usd, 0) / nullif(hs.total_hours, 0))::int as usd_por_hora,
  coalesce(qa.qa_calls, 0)           as qa_calls,
  qa.avg_qa_score,
  (hs.total_hours >= 20 and coalesce(pipe.cerradas, 0) = 0) as sin_cierres
from hs
left join pipe on pipe.assigned_to = hs.profile_id
left join qa   on qa.closer_id    = hs.profile_id;

grant select on public.v_closer_hubstaff to authenticated;
