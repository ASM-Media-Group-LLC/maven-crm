-- get_closer_activity v2: mostrar TODOS los closers, no solo los que ya registraron
-- contactos. Antes agrupaba sobre closer_contact_history → un closer con 0 contactos
-- (ej. Diego: 13 leads asignados, 0 gestión) NO aparecía. En un panel de supervisión
-- eso está al revés: el de 0 es el que más hay que ver.
--
-- Roster = gente con rol 'closer' (igual que "Ver como") ∪ cualquiera que haya
-- registrado contactos en el rango (para no perder a alguien con actividad que no
-- esté taggeado 'closer', ej. un admin con auto-contactos). LEFT JOIN a la actividad
-- → 0/{} para los inactivos. Gate por rol igual que antes.

create or replace function public.get_closer_activity(p_from date, p_to date)
returns table(
  employee_id     uuid,
  employee_name   text,
  total_contacts  bigint,
  leads_touched   bigint,
  auto_contacts   bigint,
  manual_contacts bigint,
  by_channel      jsonb,
  by_result       jsonb,
  last_activity   timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare v_super boolean;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  v_super := public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager');

  return query
  with roster as (
    select ur.user_id as emp from public.user_roles ur where ur.role = 'closer'
    union
    select h.created_by from public.closer_contact_history h
    where (h.contact_date at time zone 'America/Bogota')::date between p_from and p_to
      and h.created_by is not null
  ),
  roster_gated as (
    select emp from roster where emp is not null and (v_super or emp = auth.uid())
  ),
  rows as (
    select h.created_by, h.creator_id, h.contact_date,
           coalesce(h.channel, '—') as channel,
           coalesce(h.result, '—')  as result,
           (coalesce(h.notes,'') = '(auto)') as is_auto
    from public.closer_contact_history h
    where (h.contact_date at time zone 'America/Bogota')::date between p_from and p_to
      and h.created_by is not null
  ),
  per_emp as (
    select r.created_by,
           count(*)                              as total,
           count(distinct r.creator_id)          as leads,
           count(*) filter (where r.is_auto)     as autoc,
           count(*) filter (where not r.is_auto) as manualc,
           max(r.contact_date)                   as last_at
    from rows r group by r.created_by
  ),
  by_chan as (
    select created_by, jsonb_object_agg(channel, n) as j
    from (select created_by, channel, count(*) n from rows group by created_by, channel) t
    group by created_by
  ),
  by_res as (
    select created_by, jsonb_object_agg(result, n) as j
    from (select created_by, result, count(*) n from rows group by created_by, result) t
    group by created_by
  )
  select rg.emp,
         coalesce(p.full_name, '—'),
         coalesce(e.total, 0)::bigint, coalesce(e.leads, 0)::bigint,
         coalesce(e.autoc, 0)::bigint, coalesce(e.manualc, 0)::bigint,
         coalesce(bc.j, '{}'::jsonb), coalesce(br.j, '{}'::jsonb),
         e.last_at
  from roster_gated rg
  left join public.profiles p on p.id = rg.emp
  left join per_emp e  on e.created_by = rg.emp
  left join by_chan bc on bc.created_by = rg.emp
  left join by_res  br on br.created_by = rg.emp
  order by coalesce(e.total, 0) desc, p.full_name asc;
end; $$;

revoke all on function public.get_closer_activity(date, date) from public, anon;
grant execute on function public.get_closer_activity(date, date) to authenticated;
