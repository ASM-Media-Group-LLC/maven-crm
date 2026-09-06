-- Push de mensajes del Messenger: trigger AFTER INSERT en chat_messages que
-- encola UNA llamada a la edge web-push (action "notify") con los destinatarios
-- candidatos. La edge hace el filtro fino 2,5 s después (ya lo leyó, No-molestar,
-- "solo menciones") y compone el texto. Acá solo el filtro BARATO, por índices:
--   · participantes distintos del emisor, no silenciados, modo <> 'none';
--   · con opt-in (notification_settings.push_enabled) y maestro encendido;
--   · con al menos un dispositivo suscrito en push_subscriptions.
-- Si nadie califica, no se encola nada: con el piloto de 5 personas, la enorme
-- mayoría de los mensajes ni llegan a pg_net.
--
-- Cómo se comporta pg_net (importante para no asustarse):
--   · net.http_post NO hace red: inserta una fila en net.http_request_queue y
--     el worker (un solo proceso en background) la envía DESPUÉS del commit.
--     El INSERT del mensaje nunca espera a la edge.
--   · Si pg_net se traba, la fila espera en la cola; el watchdog
--     public.pg_net_watchdog() (cron cada 5 min) hace net.worker_restart() y los
--     pushes salen con retraso, no se pierden.
--   · timeout_milliseconds = 10 s: la edge tarda ~2,5 s de espera + 1-3 s de
--     consultas y envíos. Suficiente para capturar la respuesta real en
--     net._http_response (diagnóstico) sin retener al worker: los timeouts de
--     180-290 s fueron justamente lo que lo trabó en el pasado.
--   · Todo va en un bloque EXCEPTION: el push es best-effort y JAMÁS puede
--     tumbar el INSERT del mensaje (vault sin secreto → la edge responde 401 y
--     queda en _http_response; net/vault inaccesibles → WARNING en logs).
--
-- Rollback rápido sin tocar nada más:
--   drop trigger on_chat_message_push on public.chat_messages;
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
  -- Nada que avisar: mensajes de sistema ("X creó el grupo") y borrados.
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

revoke all on function public.push_chat_message() from public, anon, authenticated;

drop trigger if exists on_chat_message_push on public.chat_messages;
create trigger on_chat_message_push
  after insert on public.chat_messages
  for each row execute function public.push_chat_message();
