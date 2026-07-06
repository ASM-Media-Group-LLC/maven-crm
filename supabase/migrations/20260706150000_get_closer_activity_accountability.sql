-- get_closer_activity v3 → tablero de supervisión: además de la actividad del rango,
-- devuelve la RESPONSABILIDAD actual del closer:
--   · leads_assigned = leads en stage 'Asignada' (pipeline activo que le toca trabajar)
--   · leads_overdue  = de esos, cuántos tienen contacto vencido por cadencia (1,3,5,8,15,29)
-- Así el frontend puede marcar "Sin gestión" (tiene leads y 0 contactos) / "Atrasado"
-- (tiene vencidos) / "Al día", y ordenar por quién necesita atención.
-- Cambia el tipo de retorno → drop + create.

drop function if exists public.get_closer_activity(date, date);

create function public.get_closer_activity(p_from date, p_to date)
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
  ),
  -- Pipeline activo (stage 'Asignada') + cuántos están vencidos por cadencia.
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

revoke all on function public.get_closer_activity(date, date) from public, anon;
grant execute on function public.get_closer_activity(date, date) to authenticated;
