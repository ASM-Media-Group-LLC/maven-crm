-- Listado de personas para el editor de horarios (RRHH): profile + nombre + rol QA.
-- Una fila por persona trackeada en Hubstaff con rol QA. security_invoker → management.
create or replace view public.v_qa_staff
with (security_invoker = true) as
select distinct on (hm.profile_id)
  hm.profile_id,
  coalesce(p.full_name, hm.name) as name,
  case when public.has_role(hm.profile_id,'Chatter') then 'Chatter'
       when public.has_role(hm.profile_id,'closer')  then 'closer'
       when public.has_role(hm.profile_id,'manager') then 'manager'
       when public.has_role(hm.profile_id,'LLG')     then 'LLG' end as role
from public.hubstaff_members hm
left join public.profiles p on p.id = hm.profile_id
where hm.profile_id is not null
  and (public.has_role(hm.profile_id,'Chatter') or public.has_role(hm.profile_id,'closer')
       or public.has_role(hm.profile_id,'manager') or public.has_role(hm.profile_id,'LLG'))
order by hm.profile_id, name;

grant select on public.v_qa_staff to authenticated;
