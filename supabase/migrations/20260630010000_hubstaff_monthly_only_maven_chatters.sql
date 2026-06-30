-- Restringir la vista mensual a quienes tienen el ROL "Chatter" en MAVEN (no el flag is_chatter de BLU,
-- que es más amplio e incluía admins/supervisores/team-leads/gente sin cuenta en Maven). El link:
-- hubstaff_members.profile_id (backfilleado por email) → has_role(profile_id,'Chatter') (SECURITY DEFINER
-- → no choca con la RLS de user_roles, y matchea el string exacto 'Chatter').
-- Afecta a v_chatter_hubstaff_effort (subtab Company QA + tool de Clari) y al scoring c1/c4 → todo
-- queda consistente: solo chatters registrados en Maven.
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
where d.tracked_seconds > 0
  and cp.blu_employee_id is not null
  and public.has_role(hm.profile_id, 'Chatter')   -- solo rol Chatter de Maven
group by cp.blu_employee_id, cp.name, date_trunc('month', d.date);
