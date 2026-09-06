-- Encolar un aviso push genérico desde un trigger, sin repetir en cada uno el
-- vault + net.http_post + EXCEPTION. Lo usan los llamados de Cowork y las
-- asignaciones de bandeja; los mensajes del Messenger tienen su propio trigger
-- (push_chat_message) porque necesitan otro filtro.
--
-- Filtro BARATO acá (opt-in + al menos un dispositivo suscrito); el fino
-- (No-molestar en hora de Bogotá) lo hace la edge web-push, action "notify".
-- Si nadie califica no se encola nada. Best-effort: nunca tumba la transacción
-- que lo llamó (ver el EXCEPTION). pg_net solo encola; el worker envía después
-- del commit. Detalles en 20260906110000_push_chat_message_trigger.sql.
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
  where exists (select 1 from push_subscriptions ps where ps.user_id = r);

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

-- Solo la llaman triggers (SECURITY DEFINER): ningún cliente puede empujar
-- avisos a otros.
revoke all on function public.push_notify_enqueue(text, uuid[], jsonb, text, text, text, text, text)
  from public, anon, authenticated;
