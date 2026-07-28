-- Match teléfono creadora <-> contacto de WhatsApp robusto a variantes de formato.
--
-- PROBLEMA: el match se hacía por los ÚLTIMOS 10 DÍGITOS crudos. Eso falla con números
-- internacionales largos cuando cada lado guarda el número distinto:
--   · Brasil (13 díg): 55 + área(2) + "9" (9º dígito) + 8. Si un lado guarda el "9" y el
--     otro no, los últimos 10 NO coinciden (ej. Diego Mineiro 1989124988 vs 1189124988).
--   · México (13 díg): 52 + "1" móvil legacy + 10. (Los últimos 10 ya coincidían, pero se
--     canonicaliza igual por consistencia.)
-- Hoy nadie está mal matcheado (ambos lados guardan igual), pero es frágil a futuro.
--
-- CAPA 1 — canonical_phone(): normaliza quitando el "1" móvil de México y el 9º dígito de
--   Brasil, y se compara por right(canonical, 10). Estable con/sin esas variantes.
-- CAPA 2 — fallback por últimos 8 díg SOLO si esa cola pertenece a UN único número
--   canónico (guard anti-colisión): rescata números guardados sin código de país (ej.
--   Chile bare) sin arriesgar fusionar personas distintas.
--
-- Aplica a get_manager_silent_creators (tool conversacional) y get_manager_silent_no_promo
-- (digest promolog-manager-tick). La tool TS get_manager_contact_activity replica la misma
-- lógica en _shared/agent-tools/managers.ts. Validado contra prod: 0 regresiones (el match
-- nuevo es idéntico al viejo para los datos actuales; solo blinda el futuro).

-- ── CAPA 1: función canónica compartida ──────────────────────────────────────────────
create or replace function public.canonical_phone(p text)
returns text
language sql
immutable
as $function$
  with d0 as (select regexp_replace(coalesce(p,''),'\D','','g') as d)
  select case
    when length(d) = 13 and left(d,3) = '521' then '52' || substr(d,4)                       -- MX: 521... → 52...
    when length(d) = 13 and left(d,2) = '55' and substr(d,5,1) = '9' then substr(d,1,4) || substr(d,6) -- BR: quita 9º dígito
    else d
  end
  from d0;
$function$;
-- Pura/IMMUTABLE, sin acceso a tablas, pero se revoca anon/PUBLIC por consistencia con las
-- RPCs que la usan (SECURITY DEFINER); solo la llaman ellas internamente.
revoke execute on function public.canonical_phone(text) from public, anon;

-- ── get_manager_silent_creators v2 (canónico + fallback last-8 guardado) ───────────────
create or replace function public.get_manager_silent_creators(
  p_tenant uuid,
  p_days integer default 3
)
returns table (
  creator_id uuid,
  name text,
  instagram_handle text,
  manager_profile_id uuid,
  manager_name text,
  last_contact_at timestamptz,
  days_since_contact int
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with mgr_lines as (
    select id from public.wa_channels
    where tenant_id = p_tenant and department = 'manager' and active
  ),
  contact_out as (
    select right(public.canonical_phone(ct.phone_e164),10) as k10,
           right(regexp_replace(coalesce(ct.phone_e164,''),'\D','','g'),8) as k8,
           max(msg.sent_at) as last_out
    from public.wa_conversations conv
    join public.wa_contacts ct on ct.id = conv.contact_id
    join public.wa_conversation_messages msg
      on msg.conversation_id = conv.id
     and msg.deleted_at is null
     and msg.direction = 'out'
     and coalesce(msg.status,'') <> 'failed'
    where conv.channel_id in (select id from mgr_lines)
    group by 1, 2
  ),
  by_canon as (select k10, max(last_out) as last_out from contact_out where length(k10) = 10 group by k10),
  by_k8 as (select k8, count(distinct k10) as n_canon, max(last_out) as last_out from contact_out where length(k8) = 8 group by k8),
  active_models as (
    select c.id,
           coalesce(nullif(c.artistic_name,''), c.name) as name,
           c.instagram_handle,
           c.assigned_manager_profile_id as mgr,
           right(public.canonical_phone(coalesce(c.phone_e164, c.whatsapp_number, c.phone)),10) as k10,
           right(regexp_replace(coalesce(c.phone_e164, c.whatsapp_number, c.phone, ''),'\D','','g'),8) as k8
    from public.creators c
    where c.status = 'active' and c.assigned_manager_profile_id is not null
  ),
  resolved as (
    select a.id, a.name, a.instagram_handle, a.mgr,
           coalesce(
             (select bc.last_out from by_canon bc where length(a.k10) = 10 and bc.k10 = a.k10),
             (select bk.last_out from by_k8 bk where length(a.k8) = 8 and bk.k8 = a.k8 and bk.n_canon = 1)
           ) as last_out
    from active_models a
    where length(a.k10) = 10
  )
  select r.id, r.name, r.instagram_handle, r.mgr, m.full_name,
         r.last_out as last_contact_at,
         case when r.last_out is null then null else extract(day from (now() - r.last_out))::int end as days_since_contact
  from resolved r
  left join public.profiles m on m.id = r.mgr
  where r.last_out is null or r.last_out < now() - make_interval(days => p_days)
  order by m.full_name nulls last, r.last_out asc nulls first;
$function$;

grant execute on function public.get_manager_silent_creators(uuid, integer) to authenticated, service_role;
revoke execute on function public.get_manager_silent_creators(uuid, integer) from public, anon;

-- ── get_manager_silent_no_promo v2 (mismo matching; conserva acople con promo) ─────────
create or replace function public.get_manager_silent_no_promo(
  p_tenant uuid,
  p_days int default 3,
  p_low_promo_rate numeric default 0.40
)
returns table (
  creator_id uuid, name text, instagram_handle text,
  manager_profile_id uuid, manager_name text, manager_phone text,
  promo_days int, mtd_day int,
  days_since_contact int, last_contact_at timestamptz
)
language sql stable security definer set search_path = public as $function$
  with bounds as (
    select date_trunc('month', current_date)::date as this_start,
           extract(day from current_date)::int as mtd_day
  ),
  mgr_lines as (
    select id from public.wa_channels
    where tenant_id = p_tenant and department = 'manager' and active
  ),
  contact_out as (
    select right(public.canonical_phone(ct.phone_e164),10) as k10,
           right(regexp_replace(coalesce(ct.phone_e164,''),'\D','','g'),8) as k8,
           max(msg.sent_at) as last_out
    from public.wa_conversations conv
    join public.wa_contacts ct on ct.id = conv.contact_id
    join public.wa_conversation_messages msg
      on msg.conversation_id = conv.id and msg.deleted_at is null and msg.direction = 'out'
    where conv.channel_id in (select id from mgr_lines)
    group by 1, 2
  ),
  by_canon as (select k10, max(last_out) as last_out from contact_out where length(k10) = 10 group by k10),
  by_k8 as (select k8, count(distinct k10) as n_canon, max(last_out) as last_out from contact_out where length(k8) = 8 group by k8),
  active_models as (
    select c.id, coalesce(nullif(c.artistic_name,''), c.name) as name, c.instagram_handle,
           c.assigned_manager_profile_id as mgr,
           right(public.canonical_phone(coalesce(c.phone_e164, c.whatsapp_number, c.phone)),10) as k10,
           right(regexp_replace(coalesce(c.phone_e164, c.whatsapp_number, c.phone, ''),'\D','','g'),8) as k8
    from public.creators c
    where c.status = 'active' and c.assigned_manager_profile_id is not null
  ),
  promo as (
    select e.creator_id,
      count(distinct e.date::date) filter (where e.promoted in ('true','yes')) as promo_days
    from public.promolog_entries e cross join bounds b
    where e.tenant_id = p_tenant and e.date >= b.this_start::timestamptz
    group by e.creator_id
  ),
  resolved as (
    select a.id, a.name, a.instagram_handle, a.mgr,
      coalesce(
        (select bc.last_out from by_canon bc where length(a.k10) = 10 and bc.k10 = a.k10),
        (select bk.last_out from by_k8 bk where length(a.k8) = 8 and bk.k8 = a.k8 and bk.n_canon = 1)
      ) as last_out
    from active_models a
    where length(a.k10) = 10
  )
  select r.id, r.name, r.instagram_handle,
         r.mgr, m.full_name, m.phone_e164,
         coalesce(p.promo_days, 0)::int as promo_days, b.mtd_day,
         extract(day from (now() - r.last_out))::int as days_since_contact,
         r.last_out as last_contact_at
  from resolved r
  cross join bounds b
  left join public.profiles m on m.id = r.mgr
  left join promo p on p.creator_id = r.id
  where r.last_out is not null
    and r.last_out < now() - make_interval(days => p_days)
    and b.mtd_day >= 3
    and coalesce(p.promo_days, 0) < p_low_promo_rate * b.mtd_day
  order by r.last_out asc;
$function$;

revoke all on function public.get_manager_silent_no_promo(uuid, int, numeric) from public, anon;
grant execute on function public.get_manager_silent_no_promo(uuid, int, numeric) to authenticated, service_role;

notify pgrst, 'reload schema';
