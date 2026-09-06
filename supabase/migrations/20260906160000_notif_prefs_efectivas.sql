-- Las preferencias por evento (Ajustes → Notificaciones → Eventos) pasan a ser
-- EFECTIVAS. Hasta hoy la pestaña guardaba en notification_preferences y nadie
-- la leía al generar avisos (Jhon, 06/09/2026: "está desactualizado; ahí podría
-- escoger qué eventos de Cowork quiero recibir, personalizar bien").
--
-- Modelo: opt-out. Sin fila = todo encendido. Una fila puede apagar el canal
-- in-app (la campana y el sonido/aviso en la app) o el canal push (el celular)
-- de un tipo de evento. La UI escribe por tipo; acá se lee por tipo, sin mirar
-- `module` (los tipos son únicos en el catálogo del frontend).
--
-- Cuatro piezas:
--   1. notif_canal_activo(user, type, canal) — la única función que decide.
--   2. push_chat_message y push_notify_enqueue filtran destinatarios por 'push'.
--   3. BEFORE INSERT en notifications: si el usuario apagó el in-app de ese tipo,
--      la fila no se inserta (cubre a TODOS los generadores: triggers, edges y
--      frontend, sin tocarlos uno por uno).
--   4. AFTER INSERT en notifications: los avisos de la campana que no son de
--      chat (Closers, Evaluator, Creadoras…) también salen como push, con el
--      mismo filtro por tipo. Los de chat ya tienen su propio trigger.
-- El default viejo (false) era de cuando la columna Push decía "Pronto": con el
-- modelo opt-out, una fila que solo apagó el in-app no debe apagar el push.
alter table public.notification_preferences alter column channel_push set default true;

create or replace function public.notif_canal_activo(p_user uuid, p_type text, p_canal text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select coalesce(np.is_enabled, true)
       and case p_canal
             when 'push'   then coalesce(np.channel_push, true)
             when 'in_app' then coalesce(np.channel_in_app, true)
             else true
           end
    from notification_preferences np
    where np.user_id = p_user and np.notification_type = p_type
    order by np.updated_at desc nulls last
    limit 1
  ), true);
$$;
revoke all on function public.notif_canal_activo(uuid, text, text) from public, anon;
grant execute on function public.notif_canal_activo(uuid, text, text) to authenticated;

-- 2a. Mensajes del Messenger: respetar el canal push del tipo chat_message.
create or replace function public.push_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipients uuid[];
  v_token text;
begin
  if new.type = 'system' or new.is_deleted then
    return null;
  end if;

  select array_agg(cp.user_id) into v_recipients
  from chat_participants cp
  join notification_settings ns
    on ns.user_id = cp.user_id
   and ns.push_enabled
   and ns.notifications_enabled
  where cp.conversation_id = new.conversation_id
    and cp.user_id <> new.sender_id
    and not cp.is_muted
    and cp.notifications_mode <> 'none'
    and public.notif_canal_activo(cp.user_id, 'chat_message', 'push')
    and exists (select 1 from push_subscriptions ps where ps.user_id = cp.user_id);

  if v_recipients is null then
    return null;
  end if;

  begin
    select decrypted_secret into v_token
      from vault.decrypted_secrets
     where name = 'cron_internal_token';

    perform net.http_post(
      url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/web-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Token', v_token
      ),
      body := jsonb_build_object(
        'action', 'notify',
        'kind', 'chat_message',
        'recipient_ids', to_jsonb(v_recipients),
        'ref', jsonb_build_object(
          'message_id', new.id,
          'conversation_id', new.conversation_id,
          'sender_id', new.sender_id
        )
      ),
      timeout_milliseconds := 10000
    );
  exception when others then
    raise warning 'push_chat_message: % (mensaje %)', sqlerrm, new.id;
  end;

  return null;
end
$$;

-- 2b. Kinds genéricos: respetar el canal push del tipo (= kind).
create or replace function public.push_notify_enqueue(
  p_kind text,
  p_recipients uuid[],
  p_ref jsonb,
  p_title text,
  p_body text,
  p_url text,
  p_tag text,
  p_priority text default 'low'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipients uuid[];
  v_token text;
begin
  if p_recipients is null or array_length(p_recipients, 1) is null then
    return;
  end if;

  select array_agg(distinct r) into v_recipients
  from unnest(p_recipients) as r
  join notification_settings ns
    on ns.user_id = r and ns.push_enabled and ns.notifications_enabled
  where exists (select 1 from push_subscriptions ps where ps.user_id = r)
    and public.notif_canal_activo(r, p_kind, 'push');

  if v_recipients is null then
    return;
  end if;

  begin
    select decrypted_secret into v_token
      from vault.decrypted_secrets
     where name = 'cron_internal_token';

    perform net.http_post(
      url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/web-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Token', v_token
      ),
      body := jsonb_build_object(
        'action', 'notify',
        'kind', p_kind,
        'recipient_ids', to_jsonb(v_recipients),
        'ref', coalesce(p_ref, '{}'::jsonb),
        'title', p_title,
        'body', p_body,
        'url', p_url,
        'tag', p_tag,
        'priority', coalesce(p_priority, 'low')
      ),
      timeout_milliseconds := 10000
    );
  exception when others then
    raise warning 'push_notify_enqueue(%): %', p_kind, sqlerrm;
  end;
end
$$;

-- 3. In-app apagado para ese tipo → la notificación de la campana no se crea.
create or replace function public.notif_gate_in_app()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null and new.type is not null
     and not public.notif_canal_activo(new.user_id, new.type, 'in_app') then
    return null;
  end if;
  return new;
end
$$;
drop trigger if exists on_notification_gate on public.notifications;
create trigger on_notification_gate
  before insert on public.notifications
  for each row execute function public.notif_gate_in_app();

-- 4. Los avisos de la campana (menos los de chat) también van al celular.
create or replace function public.push_desde_notificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null or new.type is null or new.type = 'chat_message' then
    return null;
  end if;
  -- Ráfagas (el cron de contactos vencidos llegó a 44 filas en un minuto): al
  -- celular va UNA por tipo y persona por minuto de reloj; las demás quedan en
  -- la campana. Gana la menor (created_at, id): en un INSERT de varias filas los
  -- triggers AFTER corren al final y todas se ven entre sí, así que "existe otra
  -- en el mismo minuto" a secas las callaría a todas.
  if exists (
    select 1 from notifications n
    where n.user_id = new.user_id and n.type = new.type
      and date_trunc('minute', n.created_at) = date_trunc('minute', new.created_at)
      and (n.created_at, n.id) < (new.created_at, new.id)
  ) then
    return null;
  end if;
  perform public.push_notify_enqueue(
    new.type,
    array[new.user_id],
    jsonb_build_object('notification_id', new.id, 'reference_type', new.reference_type, 'reference_id', new.reference_id),
    coalesce(nullif(new.title, ''), 'Maven'),
    coalesce(new.message, ''),
    coalesce(nullif(new.deep_link_url, ''), '/notificaciones'),
    'notif-' || new.id,
    case when new.priority in ('critical', 'high') then 'normal' else 'low' end
  );
  return null;
end
$$;
drop trigger if exists on_notification_push on public.notifications;
create trigger on_notification_push
  after insert on public.notifications
  for each row execute function public.push_desde_notificacion();
