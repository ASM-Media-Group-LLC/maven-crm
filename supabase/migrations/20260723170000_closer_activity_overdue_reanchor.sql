-- get_closer_activity: leads_overdue RE-ANCLADO al último contacto.
--
-- Era la 4ª copia de la cadencia 1-3-5-8-15-29 con la lógica VIEJA (anclada a
-- passed_date fijo): frontend ✓ re-anclado, cron closer_contact_alerts ✓
-- (20260715120000), whatsapp-agent ✓ (#917), whatsapp-supervisor-tick ✓ (este
-- mismo PR, en TS) — y este RPC del dashboard Closers→Actividad seguía viejo.
-- Con la vieja el digest decía María "58 vencidas" / Miguel "10" cuando lo real
-- (re-anclado) era 42 / 1 (2026-07-23). Criterio único: contactar "pone al día";
-- deadline = (sin contactos) passed+1d ; (con ≥1) último_contacto + gap.
-- Hoy = fecha en America/Bogota (antes usaba current_date del server/UTC).

create or replace function public.get_closer_activity(p_from date, p_to date)
returns table(
  employee_id uuid, employee_name text, total_contacts bigint, leads_touched bigint,
  auto_contacts bigint, manual_contacts bigint, leads_assigned bigint, leads_overdue bigint,
  by_channel jsonb, by_result jsonb, last_activity timestamptz
)
language plpgsql stable security definer
set search_path to 'public'
as $function$
declare v_super boolean;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
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
  roster_gated as (select emp from roster where emp is not null and (v_super or emp = auth.uid())),
  rows as (
    select h.created_by, h.creator_id, h.contact_date,
           coalesce(h.channel,'—') as channel, coalesce(h.result,'—') as result,
           (coalesce(h.notes,'')='(auto)') as is_auto
    from public.closer_contact_history h
    where (h.contact_date at time zone 'America/Bogota')::date between p_from and p_to
      and h.created_by is not null
  ),
  per_emp as (
    select r.created_by, count(*) as total, count(distinct r.creator_id) as leads,
           count(*) filter (where r.is_auto) as autoc, count(*) filter (where not r.is_auto) as manualc,
           max(r.contact_date) as last_at
    from rows r group by r.created_by
  ),
  by_chan as (
    select created_by, jsonb_object_agg(channel, n) as j
    from (select created_by, channel, count(*) n from rows group by created_by, channel) t group by created_by
  ),
  by_res as (
    select created_by, jsonb_object_agg(result, n) as j
    from (select created_by, result, count(*) n from rows group by created_by, result) t group by created_by
  ),
  -- Overdue re-anclado (criterio compartido con frontend/cron/whatsapp-agent).
  assigned as (
    select cc.assigned_to as emp, cc.passed_date,
           (select count(*) from public.closer_contact_history h2 where h2.creator_id = cc.id) as done,
           (select max(h3.contact_date) from public.closer_contact_history h3 where h3.creator_id = cc.id) as last_contact
    from public.closer_creators cc
    where cc.stage='Asignada' and cc.assigned_to is not null and cc.passed_date is not null
  ),
  verdict as (
    select emp,
      case
        when done >= 6 then false
        when done = 0 then (now() at time zone 'America/Bogota')::date > assigned.passed_date + 1
        else (now() at time zone 'America/Bogota')::date >
             coalesce((last_contact at time zone 'America/Bogota')::date, assigned.passed_date)
             + ((array[1,3,5,8,15,29]::int[])[done+1] - (array[1,3,5,8,15,29]::int[])[done])
      end as is_overdue
    from assigned
  ),
  pipeline as (
    select verdict.emp, count(*) as n_assigned, count(*) filter (where is_overdue) as n_overdue
    from verdict group by verdict.emp
  )
  select rg.emp, coalesce(p.full_name,'—'),
         coalesce(e.total,0)::bigint, coalesce(e.leads,0)::bigint,
         coalesce(e.autoc,0)::bigint, coalesce(e.manualc,0)::bigint,
         coalesce(pl.n_assigned,0)::bigint, coalesce(pl.n_overdue,0)::bigint,
         coalesce(bc.j,'{}'::jsonb), coalesce(br.j,'{}'::jsonb), e.last_at
  from roster_gated rg
  left join public.profiles p on p.id = rg.emp
  left join per_emp e on e.created_by = rg.emp
  left join by_chan bc on bc.created_by = rg.emp
  left join by_res br on br.created_by = rg.emp
  left join pipeline pl on pl.emp = rg.emp
  order by coalesce(pl.n_overdue,0) desc, coalesce(e.total,0) desc, p.full_name asc;
end; $function$;
