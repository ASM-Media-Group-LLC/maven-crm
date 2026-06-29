-- Conciliación Hubstaff↔Maven + vista mensual por chatter (para el scorecard c4 / dashboards).

-- Backfill: mapear cada miembro de Hubstaff a su profile de Maven por email (para HR Monitoring).
-- El bridge llena el directorio pero no el profile_id; esto lo concilia por email (one-time + repetible).
update public.hubstaff_members hm
set profile_id = au.id
from auth.users au
where lower(btrim(hm.email)) = lower(btrim(au.email))
  and hm.profile_id is null
  and not exists (select 1 from public.hubstaff_members x where x.profile_id = au.id);

-- Vista mensual por chatter: agrega hubstaff_daily_data y lo cruza con chatter_performance por email
-- → blu_employee_id (la llave del scorecard). security_invoker=true → respeta la RLS de las tablas base
-- (management-only); SIN esto la vista correría como owner y saltearía RLS (fuga de PII — patrón de oro).
create or replace view public.v_chatter_hubstaff_monthly
with (security_invoker = true) as
select
  cp.blu_employee_id,
  cp.name,
  date_trunc('month', d.date)::date as period,
  count(*) as days_tracked,
  round(sum(d.tracked_seconds) / 3600.0, 1) as total_hours,
  round(avg(d.overall_activity))::int as avg_activity_pct
from public.hubstaff_daily_data d
join public.hubstaff_members hm on hm.hubstaff_user_id = d.hubstaff_user_id
join public.chatter_performance cp
  on lower(btrim(cp.email)) = lower(btrim(hm.email)) and cp.is_chatter = true
where d.tracked_seconds > 0 and cp.blu_employee_id is not null
group by cp.blu_employee_id, cp.name, date_trunc('month', d.date);

grant select on public.v_chatter_hubstaff_monthly to authenticated;
