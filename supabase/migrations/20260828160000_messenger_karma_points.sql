-- Karma Points para el Messenger de Maven
-- Ficha de perfil (popup) con 5 estrellas de karma + estrella especial "karma votado".
-- Fuentes de datos (verificadas 2026-08-28):
--   ⭐ Constancia   -> profiles.created_at (>= 6 meses)
--   ⭐ Actividad    -> chat_messages (>=100 msgs y >=10 días activos en 30d)
--   ⭐ Productividad -> hubstaff_daily_data via hubstaff_members.profile_id (act>=50% y >=40h en 30d)
--   ⭐ Rendimiento  -> QA mensual >= 9 (normalizado /10). v1: closers (qa_calls via qa_closers.profile_id, escala 0-100).
--                      chatter_daily_score/performance_evaluations quedan como extensión (hoy vacías).
--   ⭐ Compañerismo -> karma_sends: recibió karma de >= 20% del equipo elegible
--   🌟 Especial     -> karma_sends: recibió karma de > 70% del equipo elegible (easter egg, no cuenta entre las 5)
-- Los criterios/umbrales y las cifras admin SOLO se devuelven si quien llama es admin.

-- ─────────────────────────────────────────────────────────────
-- Tabla: un "karma" por par (emisor -> receptor), una sola vez.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.karma_sends (
  id            uuid primary key default gen_random_uuid(),
  giver_id      uuid not null references public.profiles(id) on delete cascade,
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (giver_id, recipient_id),
  constraint karma_no_self check (giver_id <> recipient_id)
);
create index if not exists karma_sends_recipient_idx on public.karma_sends (recipient_id);

alter table public.karma_sends enable row level security;

-- El emisor inserta/lee solo sus propias filas. Los conteos agregados salen por el RPC (SECURITY DEFINER).
drop policy if exists "karma insert own" on public.karma_sends;
create policy "karma insert own" on public.karma_sends
  for insert to authenticated with check (giver_id = auth.uid());

drop policy if exists "karma read own" on public.karma_sends;
create policy "karma read own" on public.karma_sends
  for select to authenticated using (giver_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- RPC: ficha de karma de una persona.
-- ─────────────────────────────────────────────────────────────
create or replace function public.get_karma_profile(target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller   uuid := auth.uid();
  v_is_admin boolean;
  v_role text; v_role_label text;
  v_name text; v_avatar text; v_seed text; v_created timestamptz;
  s_constancia boolean := false;
  s_actividad boolean := false;
  s_productividad boolean := false;
  s_rendimiento boolean := false;
  s_companerismo boolean := false;
  v_sent int := 0; v_recv int := 0; v_active_days int := 0;
  v_hub_act int := null; v_hub_hours numeric := null;
  v_givers int := 0; v_eligible int := 0; v_vote_pct int := 0;
  v_viewer_sent boolean := false;
  v_special boolean := false;
  v_stars_count int := 0;
  result jsonb;
begin
  -- ¿quien mira es admin? (tier-aware vía role_groups)
  v_is_admin := exists (
    select 1 from user_roles ur
    join role_groups rg on rg.role_name = ur.role
    where ur.user_id = v_caller and rg.is_admin = true
  );

  select full_name, avatar_url, avatar_seed, created_at
    into v_name, v_avatar, v_seed, v_created
  from profiles where id = target;
  if not found then
    return jsonb_build_object('error','not_found');
  end if;

  -- rol + etiqueta (los códigos seed se mapean; los roles custom se muestran tal cual)
  select role into v_role from user_roles where user_id = target limit 1;
  v_role_label := case v_role
    when 'agent' then 'Chatter'
    when 'closer' then 'Closer'
    when 'manager' then 'Manager'
    when 'admin' then 'Admin'
    when 'supervisor' then 'Supervisor'
    when 'employee' then 'Empleado'
    when 'spammer' then 'Warming'
    else coalesce(v_role, 'Miembro')
  end;

  -- ⭐ Constancia: >= 6 meses
  s_constancia := v_created is not null and v_created <= now() - interval '6 months';

  -- Actividad en Messenger (30d): enviados + días activos
  select count(*), count(distinct (created_at at time zone 'UTC')::date)
    into v_sent, v_active_days
  from chat_messages
  where sender_id = target and is_deleted = false and type <> 'system'
    and created_at >= now() - interval '30 days';
  -- ⭐ Actividad: >= 100 msgs repartidos en >= 10 días
  s_actividad := v_sent >= 100 and v_active_days >= 10;

  -- Recibidos (30d) — para la tarjeta admin
  select count(*) into v_recv
  from chat_messages m
  where m.sender_id <> target and m.is_deleted = false and m.type <> 'system'
    and m.created_at >= now() - interval '30 days'
    and m.conversation_id in (select conversation_id from chat_participants where user_id = target);

  -- Productividad Hubstaff (30d)
  select round(avg(d.overall_activity))::int, round(sum(d.tracked_seconds)/3600.0, 1)
    into v_hub_act, v_hub_hours
  from hubstaff_daily_data d
  join hubstaff_members hm on hm.hubstaff_user_id = d.hubstaff_user_id
  where hm.profile_id = target and d.tracked_seconds > 0
    and d.date >= current_date - 30;
  -- ⭐ Productividad: actividad media >= 50% y >= 40h en 30d
  s_productividad := v_hub_act is not null and v_hub_act >= 50 and coalesce(v_hub_hours,0) >= 40;

  -- ⭐ Rendimiento: QA del mes calendario anterior >= 9 (/10). v1 = closers (claude_score 0-100).
  select (avg(qc.claude_score) / 10.0) >= 9 into s_rendimiento
  from qa_calls qc
  join qa_closers qcl on qcl.id = qc.closer_id
  where qcl.profile_id = target
    and qc.claude_score is not null
    and date_trunc('month', qc.call_date) = date_trunc('month', current_date - interval '1 month');
  s_rendimiento := coalesce(s_rendimiento, false);

  -- Equipo elegible (internos, sin bots/warming, sin la propia persona)
  select count(distinct user_id) into v_eligible
  from user_roles
  where user_id <> target and role not in ('spammer','Warming');

  -- Karma recibido
  select count(*) into v_givers from karma_sends where recipient_id = target;
  v_viewer_sent := exists(select 1 from karma_sends where recipient_id = target and giver_id = v_caller);
  if v_eligible > 0 then v_vote_pct := round(100.0 * v_givers / v_eligible); end if;

  -- ⭐ Compañerismo: karma de >= 20% del equipo
  s_companerismo := v_eligible > 0 and v_givers >= ceil(0.20 * v_eligible);
  -- 🌟 Especial: karma de > 70% del equipo
  v_special := v_eligible > 0 and v_givers > 0.70 * v_eligible;

  v_stars_count := s_rendimiento::int + s_actividad::int + s_constancia::int
                 + s_productividad::int + s_companerismo::int;

  result := jsonb_build_object(
    'user_id', target,
    'name', v_name,
    'avatar_url', v_avatar,
    'avatar_seed', v_seed,
    'role', v_role_label,
    'stars', jsonb_build_object(
      'rendimiento', s_rendimiento,
      'actividad', s_actividad,
      'constancia', s_constancia,
      'productividad', s_productividad,
      'companerismo', s_companerismo
    ),
    'stars_count', v_stars_count,
    'special', v_special,
    'vote_pct', v_vote_pct,
    'viewer_has_sent', v_viewer_sent,
    'is_self', target = v_caller,
    'viewer_is_admin', v_is_admin
  );

  -- Extras SOLO-admin: el "por qué" (criterios) + cifras de mensajes + Hubstaff.
  if v_is_admin then
    result := result || jsonb_build_object('admin', jsonb_build_object(
      'msgs_sent_30d', v_sent,
      'msgs_recv_30d', v_recv,
      'active_days_30d', v_active_days,
      'hub_activity_30d', v_hub_act,
      'hub_hours_30d', v_hub_hours,
      'karma_givers', v_givers,
      'eligible', v_eligible,
      'criteria', jsonb_build_object(
        'rendimiento',   jsonb_build_object('met', s_rendimiento,   'label','Rendimiento',  'rule','QA mensual ≥ 9'),
        'actividad',     jsonb_build_object('met', s_actividad,     'label','Actividad',    'rule','≥ 100 msgs / 30 días en ≥ 10 días'),
        'constancia',    jsonb_build_object('met', s_constancia,    'label','Constancia',   'rule','≥ 6 meses en el equipo'),
        'productividad', jsonb_build_object('met', s_productividad, 'label','Productividad','rule','Hubstaff ≥ 50% act. y ≥ 40h'),
        'companerismo',  jsonb_build_object('met', s_companerismo,  'label','Compañerismo', 'rule','karma de ≥ 20% del equipo')
      )
    ));
  end if;

  return result;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- RPC: mandar karma (una sola vez por par). Devuelve la ficha actualizada.
-- ─────────────────────────────────────────────────────────────
create or replace function public.send_karma(target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_caller uuid := auth.uid();
begin
  if v_caller is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if v_caller = target then
    return jsonb_build_object('ok', false, 'error', 'cannot_karma_self');
  end if;
  -- solo usuarios internos (con rol) pueden mandar karma
  if not exists (select 1 from user_roles where user_id = v_caller) then
    return jsonb_build_object('ok', false, 'error', 'not_eligible');
  end if;
  insert into karma_sends (giver_id, recipient_id)
  values (v_caller, target)
  on conflict (giver_id, recipient_id) do nothing;
  return public.get_karma_profile(target);
end;
$$;

grant execute on function public.get_karma_profile(uuid) to authenticated;
grant execute on function public.send_karma(uuid) to authenticated;
