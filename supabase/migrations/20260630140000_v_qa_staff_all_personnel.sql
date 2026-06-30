-- Ampliar el picker de horarios a TODO el personal de Maven (profiles con al menos un rol),
-- no solo los trackeados en Hubstaff con rol QA. `in_hubstaff` indica si su puntualidad se puede
-- medir (tiene actividad de Hubstaff). Rol "principal" por prioridad de display. security_invoker.
create or replace view public.v_qa_staff
with (security_invoker = true) as
select
  p.id as profile_id,
  p.full_name as name,
  (select ur.role from public.user_roles ur where ur.user_id = p.id
   order by case ur.role
     when 'admin' then 1 when 'owner' then 1 when 'manager' then 2
     when 'Chatter Supervisor' then 3 when 'Team Leader' then 3
     when 'closer' then 4 when 'Chatter' then 5 when 'LLG' then 6
     else 9 end, ur.role
   limit 1) as role,
  exists (select 1 from public.hubstaff_members hm where hm.profile_id = p.id) as in_hubstaff
from public.profiles p
where exists (select 1 from public.user_roles ur where ur.user_id = p.id);

grant select on public.v_qa_staff to authenticated;
