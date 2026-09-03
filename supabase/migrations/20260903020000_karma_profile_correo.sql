-- Ficha del Messenger: mostrar el correo de la persona (pedido de Jhon 02/09/2026).
--
-- La ficha ya la ve todo el equipo; el correo de trabajo es dato de contacto
-- interno, así que va para todos (no es PII de fan ni teléfono personal).
-- Se toma la casilla de Maven si la tiene (mail_credentials, la autoritativa)
-- y si no, el correo con el que entra a Maven (auth.users).
--
-- `viewer_can_mail` decide si la ficha ofrece "Escribirle" desde Maven: quien
-- mira necesita SU casilla activa y el módulo Correo habilitado. Sin eso solo
-- se ofrece copiar (el botón llevaría a una pantalla vacía o a un rebote de
-- permisos).
create or replace function public.get_karma_profile(target uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller   uuid := auth.uid();
  v_is_admin boolean;
  v_role text; v_role_label text;
  v_name text; v_avatar text; v_seed text; v_created timestamptz;
  v_email text; v_viewer_can_mail boolean := false;
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

  -- Correo de la persona: casilla de Maven si existe, si no el de acceso.
  select coalesce(
    (select c.email_address from mail_credentials c where c.user_id = target and c.revoked_at is null limit 1),
    (select u.email from auth.users u where u.id = target)
  ) into v_email;

  -- ¿Quien mira puede escribir desde Maven?
  v_viewer_can_mail :=
    exists (select 1 from mail_credentials c where c.user_id = v_caller and c.revoked_at is null)
    and public.has_permission(v_caller, 'Correo');

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

  s_constancia := v_created is not null and v_created <= now() - interval '6 months';

  select count(*), count(distinct (created_at at time zone 'UTC')::date)
    into v_sent, v_active_days
  from chat_messages
  where sender_id = target and is_deleted = false and type <> 'system'
    and created_at >= now() - interval '30 days';
  s_actividad := v_sent >= 100 and v_active_days >= 10;

  select count(*) into v_recv
  from chat_messages m
  where m.sender_id <> target and m.is_deleted = false and m.type <> 'system'
    and m.created_at >= now() - interval '30 days'
    and m.conversation_id in (select conversation_id from chat_participants where user_id = target);

  select round(avg(d.overall_activity))::int, round(sum(d.tracked_seconds)/3600.0, 1)
    into v_hub_act, v_hub_hours
  from hubstaff_daily_data d
  join hubstaff_members hm on hm.hubstaff_user_id = d.hubstaff_user_id
  where hm.profile_id = target and d.tracked_seconds > 0
    and d.date >= current_date - 30;
  s_productividad := v_hub_act is not null and v_hub_act >= 65 and coalesce(v_hub_hours,0) >= 40;

  select (avg(qc.claude_score) / 10.0) >= 9 into s_rendimiento
  from qa_calls qc
  join qa_closers qcl on qcl.id = qc.closer_id
  where qcl.profile_id = target
    and qc.claude_score is not null
    and date_trunc('month', qc.call_date) = date_trunc('month', current_date - interval '1 month');
  s_rendimiento := coalesce(s_rendimiento, false);

  select count(distinct user_id) into v_eligible
  from user_roles
  where user_id <> target and role not in ('spammer','Warming');

  select count(*) into v_givers from karma_sends where recipient_id = target;
  v_viewer_sent := exists(select 1 from karma_sends where recipient_id = target and giver_id = v_caller);
  if v_eligible > 0 then v_vote_pct := round(100.0 * v_givers / v_eligible); end if;

  s_companerismo := v_eligible > 0 and v_givers >= ceil(0.20 * v_eligible);
  v_special := v_eligible > 0 and v_givers > 0.70 * v_eligible;

  v_stars_count := s_rendimiento::int + s_actividad::int + s_constancia::int
                 + s_productividad::int + s_companerismo::int;

  result := jsonb_build_object(
    'user_id', target, 'name', v_name, 'avatar_url', v_avatar, 'avatar_seed', v_seed,
    'role', v_role_label,
    'email', v_email, 'viewer_can_mail', v_viewer_can_mail,
    'stars', jsonb_build_object(
      'rendimiento', s_rendimiento, 'actividad', s_actividad, 'constancia', s_constancia,
      'productividad', s_productividad, 'companerismo', s_companerismo
    ),
    'stars_count', v_stars_count, 'special', v_special, 'vote_pct', v_vote_pct,
    'viewer_has_sent', v_viewer_sent, 'is_self', target = v_caller, 'viewer_is_admin', v_is_admin
  );

  if v_is_admin then
    result := result || jsonb_build_object('admin', jsonb_build_object(
      'msgs_sent_30d', v_sent, 'msgs_recv_30d', v_recv, 'active_days_30d', v_active_days,
      'hub_activity_30d', v_hub_act, 'hub_hours_30d', v_hub_hours,
      'karma_givers', v_givers, 'eligible', v_eligible,
      'criteria', jsonb_build_object(
        'rendimiento',   jsonb_build_object('met', s_rendimiento,   'label','Rendimiento',  'rule','QA mensual >= 9'),
        'actividad',     jsonb_build_object('met', s_actividad,     'label','Actividad',    'rule','>= 100 msgs / 30 dias en >= 10 dias'),
        'constancia',    jsonb_build_object('met', s_constancia,    'label','Constancia',   'rule','>= 6 meses en el equipo'),
        'productividad', jsonb_build_object('met', s_productividad, 'label','Productividad','rule','Hubstaff >= 65% act. y >= 40h'),
        'companerismo',  jsonb_build_object('met', s_companerismo,  'label','Companerismo', 'rule','karma de >= 20% del equipo')
      )
    ));
  end if;

  return result;
end;
$function$;
