-- get_manager_silent_no_promo — señal PROACTIVA para el supervisor de Managers:
-- creadoras a las que la manager NO le escribe hace >= N días POR LA LÍNEA de las
-- Managers Y que además NO están promocionando. La idea (pedido del owner): que el
-- bot le recuerde a la manager "hace X días no le escribís a <creadora> y no
-- promociona → escribile e incentivá promo".
--
-- Sólo lee TIMESTAMPS de último contacto (no el contenido del chat). "Último
-- contacto" = último saliente (direction='out', sea desde Maven o desde el celular
-- capturado como external) en una conversación de una línea department='manager'.
--
-- ⚠️ La línea de Managers se conectó 2026-07-16 → recién ahí empieza a haber
-- historial. Por eso SÓLO alarma cuando existe una conversación con último saliente
-- (creadoras sin conversación en la línea = "aún no capturado", NO se alarman).
--
-- "No promociona" = misma definición que get_manager_growth_feed (promovió en <40%
-- de los días del mes, con piso de 3 días transcurridos para no alarmar a comienzo
-- de mes). El match creadora↔conversación es por ÚLTIMOS 10 DÍGITOS del teléfono
-- (los teléfonos en Maven vienen locales/sucios; ver resolve_wa_name).
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
language sql stable security definer set search_path = public as $$
  with bounds as (
    select date_trunc('month', current_date)::date as this_start,
           extract(day from current_date)::int as mtd_day
  ),
  mgr_lines as (
    select id from public.wa_channels
    where tenant_id = p_tenant and department = 'manager' and active
  ),
  -- Último SALIENTE por teléfono (últimos 10 díg) en las líneas de managers.
  last_contact as (
    select right(regexp_replace(coalesce(ct.phone_e164,''),'\D','','g'),10) as d10,
           max(msg.sent_at) filter (where msg.direction = 'out') as last_out_at
    from public.wa_conversations conv
    join public.wa_contacts ct on ct.id = conv.contact_id
    join public.wa_conversation_messages msg
      on msg.conversation_id = conv.id and msg.deleted_at is null
    where conv.channel_id in (select id from mgr_lines)
    group by 1
  ),
  active_models as (
    select c.id, coalesce(nullif(c.artistic_name,''), c.name) as name, c.instagram_handle,
           c.assigned_manager_profile_id as mgr,
           right(regexp_replace(coalesce(c.phone_e164, c.whatsapp_number, c.phone, ''),'\D','','g'),10) as d10
    from public.creators c
    where c.status = 'active' and c.assigned_manager_profile_id is not null
  ),
  promo as (
    select e.creator_id,
      count(distinct e.date::date) filter (where e.promoted in ('true','yes')) as promo_days
    from public.promolog_entries e cross join bounds b
    where e.tenant_id = p_tenant and e.date >= b.this_start::timestamptz
    group by e.creator_id
  )
  select a.id, a.name, a.instagram_handle,
         a.mgr, m.full_name, m.phone_e164,
         coalesce(p.promo_days, 0)::int as promo_days, b.mtd_day,
         extract(day from (now() - lc.last_out_at))::int as days_since_contact,
         lc.last_out_at
  from active_models a
  cross join bounds b
  join last_contact lc on length(a.d10) = 10 and lc.d10 = a.d10
  left join public.profiles m on m.id = a.mgr
  left join promo p on p.creator_id = a.id
  where lc.last_out_at is not null                                    -- hubo contacto por la línea
    and lc.last_out_at < now() - make_interval(days => p_days)        -- ≥ N días sin escribirle
    and b.mtd_day >= 3
    and coalesce(p.promo_days, 0) < p_low_promo_rate * b.mtd_day      -- no promociona
  order by lc.last_out_at asc;                                        -- el más abandonado primero
$$;

revoke all on function public.get_manager_silent_no_promo(uuid, int, numeric) from public, anon;
grant execute on function public.get_manager_silent_no_promo(uuid, int, numeric) to authenticated, service_role;

notify pgrst, 'reload schema';
