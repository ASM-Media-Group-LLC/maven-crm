-- Productividad genérica (solo esfuerzo) por rol QA + Productividad de LLG (esfuerzo + leads).
-- Managers no tienen fuente de resultado poblada → solo esfuerzo (horas/actividad/días).
-- LLG: leads generados (leadgen_entries.lg_user_id = profile del autor) del mes.
-- security_invoker → RLS management de hubstaff_daily_data (y leadgen_entries para LLG).

create or replace view public.v_qa_effort
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
)
select m.hubstaff_user_id, m.profile_id, m.name, m.role,
  date_trunc('month', d.date)::date as period,
  count(*) as dias,
  round(sum(d.tracked_seconds) / 3600.0, 1) as total_hours,
  round(avg(d.overall_activity))::int as avg_activity_pct
from mem m
join public.hubstaff_daily_data d on d.hubstaff_user_id = m.hubstaff_user_id
where d.tracked_seconds > 0
group by m.hubstaff_user_id, m.profile_id, m.name, m.role, date_trunc('month', d.date);

grant select on public.v_qa_effort to authenticated;

create or replace view public.v_llg_hubstaff
with (security_invoker = true) as
select e.name, e.period, e.dias, e.total_hours, e.avg_activity_pct,
  coalesce(l.leads, 0) as leads,
  round(coalesce(l.leads, 0) / nullif(e.total_hours, 0), 1) as leads_por_hora
from public.v_qa_effort e
left join lateral (
  select count(*) as leads
  from public.leadgen_entries le
  where le.lg_user_id = e.profile_id
    and date_trunc('month', le.created_at) = e.period
) l on true
where e.role = 'LLG';

grant select on public.v_llg_hubstaff to authenticated;
