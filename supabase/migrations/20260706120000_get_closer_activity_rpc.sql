-- Dashboard de actividad de Closers: contactos hechos por cada empleado en un rango de fechas.
-- Fuente: closer_contact_history (contactos MANUALES del chip N/6 + AUTO de la bandeja WA/TG,
-- estos con notes='(auto)'). Se agrupa por created_by = el empleado que hizo el contacto.
-- Días calculados en zona America/Bogota (para que "hoy" y los rangos cuadren con Colombia).
-- Permisos: admin/manager ven a TODOS los closers; un closer solo se ve a sí mismo.
-- SECURITY DEFINER para saltar de forma controlada la RLS de closer_contact_history
-- (deny-all salvo dueño/manager) — el gate por rol se aplica dentro de la función.

-- 1) Resumen por empleado ------------------------------------------------------
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
  with rows as (
    select h.created_by, h.creator_id, h.contact_date,
           coalesce(h.channel, '—') as channel,
           coalesce(h.result, '—')  as result,
           (coalesce(h.notes,'') = '(auto)') as is_auto  -- notes NULL = manual (canal+resultado sin nota)
    from public.closer_contact_history h
    where (h.contact_date at time zone 'America/Bogota')::date between p_from and p_to
      and h.created_by is not null
      and (v_super or h.created_by = auth.uid())
  ),
  per_emp as (
    select r.created_by,
           count(*)                                          as total,
           count(distinct r.creator_id)                      as leads,
           count(*) filter (where r.is_auto)                 as autoc,
           count(*) filter (where not r.is_auto)             as manualc,
           max(r.contact_date)                               as last_at
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
  select e.created_by,
         coalesce(p.full_name, '—'),
         e.total::bigint, e.leads::bigint, e.autoc::bigint, e.manualc::bigint,
         coalesce(bc.j, '{}'::jsonb), coalesce(br.j, '{}'::jsonb),
         e.last_at
  from per_emp e
  left join public.profiles p on p.id = e.created_by
  left join by_chan bc on bc.created_by = e.created_by
  left join by_res  br on br.created_by = e.created_by
  order by e.total desc;
end; $$;

revoke all on function public.get_closer_activity(date, date) from public, anon;
grant execute on function public.get_closer_activity(date, date) to authenticated;

-- 2) Detalle de un empleado (drill-down: cada contacto con canal, resultado y notas) --------
create or replace function public.get_closer_activity_detail(p_from date, p_to date, p_employee uuid)
returns table(
  contact_id   uuid,
  contact_date timestamptz,
  lead_id      uuid,
  lead_handle  text,
  channel      text,
  result       text,
  notes        text,
  is_auto      boolean
)
language plpgsql stable security definer set search_path = public as $$
declare v_super boolean;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  v_super := public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager');
  -- un closer solo puede pedir su propio detalle
  if not v_super and p_employee is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select h.id, h.contact_date, h.creator_id, cc.instagram_handle,
         h.channel, h.result, h.notes, (coalesce(h.notes,'') = '(auto)')
  from public.closer_contact_history h
  join public.closer_creators cc on cc.id = h.creator_id
  where (h.contact_date at time zone 'America/Bogota')::date between p_from and p_to
    and h.created_by = p_employee
  order by h.contact_date desc;
end; $$;

revoke all on function public.get_closer_activity_detail(date, date, uuid) from public, anon;
grant execute on function public.get_closer_activity_detail(date, date, uuid) to authenticated;
