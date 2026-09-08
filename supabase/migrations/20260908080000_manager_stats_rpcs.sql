-- TAB "MANAGERS" DE PROMOLOG (rediseño del viejo "Agentes", pedido de Jhon 08/09).
-- Dos RPCs nuevas por CREADORA (el front agrega por manager y arma el drill-down):
--
--  · get_manager_contact_stats(p_from, p_to): último contacto saliente por la
--    línea de WhatsApp del departamento 'manager' + días con contacto y mensajes
--    en el rango. Matching creadora↔contacto por ÚLTIMOS 10 DÍGITOS del teléfono
--    (misma regla que get_manager_silent_creators). La línea es compartida: no se
--    sabe quién tipeó; la atribución es por la manager ASIGNADA en la ficha.
--  · get_manager_growth_stats(p_from, p_to): fans nuevos, $ subs nuevas, $ subs
--    recurrentes y total del rango + el MISMO tramo anterior, desde BLU
--    (creator_daily_earnings; día Colombia).
--
-- Gate de rol como promo_creator_period_scores (management). SECURITY DEFINER →
-- revocado a anon/public.

create or replace function public.get_manager_contact_stats(
  p_from date,
  p_to date,
  p_tenant uuid default null
)
returns table (
  creator_id uuid,
  name text,
  instagram_handle text,
  manager_profile_id uuid,
  phone_ok boolean,
  last_contact_at timestamptz,
  contact_days_in_range integer,
  msgs_in_range integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    coalesce(current_setting('request.jwt.claims', true), '') = ''
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
    or exists (select 1 from public.user_roles ur
               where ur.user_id = auth.uid() and ur.role in ('admin','manager','owner'))
  ) then
    raise exception 'forbidden: métricas de managers solo para management' using errcode = '42501';
  end if;

  return query
  with mgr_lines as (
    select ch.id from public.wa_channels ch
    where ch.department = 'manager' and ch.active
      and (p_tenant is null or ch.tenant_id = p_tenant)
  ),
  outbound as (
    select right(regexp_replace(coalesce(ct.phone_e164,''),'\D','','g'),10) as d10,
           msg.sent_at,
           -- día Bogotá del mensaje
           ((msg.sent_at at time zone 'America/Bogota')::date) as dia_bog
    from public.wa_conversations conv
    join public.wa_contacts ct on ct.id = conv.contact_id
    join public.wa_conversation_messages msg
      on msg.conversation_id = conv.id
     and msg.deleted_at is null
     and msg.direction = 'out'
     and coalesce(msg.status,'') <> 'failed'
    where conv.channel_id in (select id from mgr_lines)
  ),
  per_phone as (
    select d10,
           max(sent_at) as last_out_at,
           count(distinct dia_bog) filter (where dia_bog between p_from and p_to)::int as contact_days,
           count(*) filter (where dia_bog between p_from and p_to)::int as msgs
    from outbound
    group by d10
  ),
  models as (
    select c.id,
           coalesce(nullif(c.artistic_name,''), c.name) as cname,
           c.instagram_handle as ig,
           c.assigned_manager_profile_id as mgr,
           right(regexp_replace(coalesce(c.phone_e164, c.whatsapp_number, c.phone, ''),'\D','','g'),10) as d10
    from public.creators c
    where c.status = 'active' and c.assigned_manager_profile_id is not null
  )
  select m.id, m.cname, m.ig, m.mgr,
         (length(m.d10) = 10) as phone_ok,
         pp.last_out_at,
         coalesce(pp.contact_days, 0),
         coalesce(pp.msgs, 0)
  from models m
  left join per_phone pp on length(m.d10) = 10 and pp.d10 = m.d10;
end;
$$;

create or replace function public.get_manager_growth_stats(
  p_from date,
  p_to date,
  p_tenant uuid default null
)
returns table (
  creator_id uuid,
  name text,
  instagram_handle text,
  manager_profile_id uuid,
  new_fans integer,
  new_sub_gross numeric,
  recurring_sub_gross numeric,
  total_gross numeric,
  prev_new_fans integer,
  prev_new_sub_gross numeric,
  prev_total_gross numeric,
  days_with_data integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_len int := (p_to - p_from) + 1;
  v_prev_from date := p_from - v_len;
  v_prev_to date := p_from - 1;
begin
  if not (
    coalesce(current_setting('request.jwt.claims', true), '') = ''
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
    or exists (select 1 from public.user_roles ur
               where ur.user_id = auth.uid() and ur.role in ('admin','manager','owner'))
  ) then
    raise exception 'forbidden: métricas de managers solo para management' using errcode = '42501';
  end if;

  return query
  with models as (
    select c.id,
           coalesce(nullif(c.artistic_name,''), c.name) as cname,
           c.instagram_handle as ig,
           c.assigned_manager_profile_id as mgr
    from public.creators c
    where c.status = 'active' and c.assigned_manager_profile_id is not null
  ),
  cur as (
    select e.creator_id,
           sum(coalesce(e.new_fans,0))::int as new_fans,
           sum(coalesce(e.new_sub_gross,0)) as new_sub,
           sum(coalesce(e.recurring_sub_gross,0)) as rec_sub,
           sum(coalesce(e.total_gross,0)) as total,
           count(distinct e.date)::int as days_with_data
    from public.creator_daily_earnings e
    where e.date between p_from and p_to
      and (p_tenant is null or e.tenant_id = p_tenant)
    group by e.creator_id
  ),
  prev as (
    select e.creator_id,
           sum(coalesce(e.new_fans,0))::int as new_fans,
           sum(coalesce(e.new_sub_gross,0)) as new_sub,
           sum(coalesce(e.total_gross,0)) as total
    from public.creator_daily_earnings e
    where e.date between v_prev_from and v_prev_to
      and (p_tenant is null or e.tenant_id = p_tenant)
    group by e.creator_id
  )
  select m.id, m.cname, m.ig, m.mgr,
         coalesce(cur.new_fans, 0),
         coalesce(cur.new_sub, 0),
         coalesce(cur.rec_sub, 0),
         coalesce(cur.total, 0),
         coalesce(prev.new_fans, 0),
         coalesce(prev.new_sub, 0),
         coalesce(prev.total, 0),
         coalesce(cur.days_with_data, 0)
  from models m
  left join cur on cur.creator_id = m.id
  left join prev on prev.creator_id = m.id;
end;
$$;

revoke execute on function public.get_manager_contact_stats(date, date, uuid) from public, anon;
revoke execute on function public.get_manager_growth_stats(date, date, uuid) from public, anon;
grant execute on function public.get_manager_contact_stats(date, date, uuid) to authenticated, service_role;
grant execute on function public.get_manager_growth_stats(date, date, uuid) to authenticated, service_role;
