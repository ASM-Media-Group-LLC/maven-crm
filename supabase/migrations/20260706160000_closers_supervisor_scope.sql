-- Team Leader (y cualquier supervisor_or_above) debe ver el módulo Closers como
-- supervisor: "Ver como" + data de todos los closers. La RLS de closer_creators YA
-- lo permite (policy "Supervisors+ view all closer_creators" + has_closer_global_scope),
-- pero faltaban 3 cosas:
--   1) las RPCs de Actividad gateaban por has_role(admin|manager) → excluían supervisor.
--   2) closer_contact_history solo tenía policy "Managers view all" (no supervisor) →
--      el historial de contacto de otros closers quedaba invisible por RLS.
-- Alineamos ambas con el mismo criterio que closer_creators: supervisor_or_above
-- (incluye admin/manager/supervisor/Team Leader) O has_closer_global_scope (honra el
-- "todos los datos" del data_scope de la UI).

-- 1) RPC resumen: gate ampliado ------------------------------------------------
create or replace function public.get_closer_activity(p_from date, p_to date)
returns table(
  employee_id     uuid,
  employee_name   text,
  total_contacts  bigint,
  leads_touched   bigint,
  auto_contacts   bigint,
  manual_contacts bigint,
  leads_assigned  bigint,
  leads_overdue   bigint,
  by_channel      jsonb,
  by_result       jsonb,
  last_activity   timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare v_super boolean;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  -- supervisor_or_above (admin/manager/supervisor/Team Leader) o global scope por data_scope
  v_super := public.is_in_role_group(auth.uid(), 'supervisor_or_above')
             or public.has_closer_global_scope(auth.uid());

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
  ),
  assigned as (
    select cc.assigned_to as emp,
           (current_date - cc.passed_date) as days_since,
           (select count(*) from public.closer_contact_history h2 where h2.creator_id = cc.id) as done
    from public.closer_creators cc
    where cc.stage = 'Asignada' and cc.assigned_to is not null and cc.passed_date is not null
  ),
  pipeline as (
    select emp,
           count(*) as n_assigned,
           count(*) filter (
             where done < 6 and days_since > (array[1,3,5,8,15,29]::int[])[done + 1]
           ) as n_overdue
    from assigned group by emp
  )
  select rg.emp,
         coalesce(p.full_name, '—'),
         coalesce(e.total, 0)::bigint, coalesce(e.leads, 0)::bigint,
         coalesce(e.autoc, 0)::bigint, coalesce(e.manualc, 0)::bigint,
         coalesce(pl.n_assigned, 0)::bigint, coalesce(pl.n_overdue, 0)::bigint,
         coalesce(bc.j, '{}'::jsonb), coalesce(br.j, '{}'::jsonb),
         e.last_at
  from roster_gated rg
  left join public.profiles p on p.id = rg.emp
  left join per_emp e   on e.created_by = rg.emp
  left join by_chan bc  on bc.created_by = rg.emp
  left join by_res  br  on br.created_by = rg.emp
  left join pipeline pl on pl.emp = rg.emp
  order by coalesce(pl.n_overdue, 0) desc, coalesce(e.total, 0) desc, p.full_name asc;
end; $$;

-- 2) RPC detalle: mismo gate ---------------------------------------------------
create or replace function public.get_closer_activity_detail(p_from date, p_to date, p_employee uuid)
returns table(
  contact_id    uuid,
  contact_date  timestamptz,
  lead_id       uuid,
  lead_handle   text,
  lead_stage    text,
  lead_category text,
  lead_monetization numeric,
  channel       text,
  result        text,
  notes         text,
  is_auto       boolean
)
language plpgsql stable security definer set search_path = public as $$
declare v_super boolean;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  v_super := public.is_in_role_group(auth.uid(), 'supervisor_or_above')
             or public.has_closer_global_scope(auth.uid());
  if not v_super and p_employee is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select h.id, h.contact_date, h.creator_id, cc.instagram_handle,
         cc.stage, cc.category, cc.estimated_monetization,
         h.channel, h.result, h.notes, (coalesce(h.notes,'') = '(auto)')
  from public.closer_contact_history h
  join public.closer_creators cc on cc.id = h.creator_id
  where (h.contact_date at time zone 'America/Bogota')::date between p_from and p_to
    and h.created_by = p_employee
  order by h.contact_date desc;
end; $$;

-- 3) RLS: supervisor_or_above (+ global scope) puede leer TODO el historial ----
drop policy if exists "Supervisors+ view all contact history" on public.closer_contact_history;
create policy "Supervisors+ view all contact history"
  on public.closer_contact_history for select
  using (public.is_in_role_group(auth.uid(), 'supervisor_or_above')
         or public.has_closer_global_scope(auth.uid()));
