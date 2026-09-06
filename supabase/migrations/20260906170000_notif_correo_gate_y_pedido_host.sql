-- Canal CORREO de los eventos (Jhon, 06/09/2026: "no elimines las de correo,
-- crea el camino también, aunque esas siempre desactivadas todas por defecto").
--
-- Opt-IN: sin fila, o fila sin channel_email = true, no se manda nada. El
-- correo sale de push_notify_enqueue, que desde acá resuelve los dos canales
-- (el nombre quedó de cuando solo había push): así todo kind que ya llega al
-- celular —llamado de Cowork, asignación de la bandeja, avisos de la campana
-- (Closers, Evaluador, Creadoras)— puede llegar también al correo de la cuenta.
-- Los mensajes del Messenger y el "correo nuevo" no pasan por acá: no tienen
-- canal correo (avisar por correo de cada mensaje o de cada correo no es un
-- caso real). La ráfaga ya viene acotada por push_desde_notificacion (1 por
-- tipo y persona por minuto).
--
-- Salida: la edge send-notification-email (Resend, noreply@mail.maven-ai.me),
-- llamada como los crons de la bandeja (20260618140000): anon key de Bearer
-- para el verify_jwt del gateway + X-Cron-Token para la auth de la función.

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
             when 'email'  then coalesce(np.channel_email, false)
             else true
           end
    from notification_preferences np
    where np.user_id = p_user and np.notification_type = p_type
    order by np.updated_at desc nulls last
    limit 1
  ), p_canal <> 'email');  -- sin fila: in_app y push encendidos, correo apagado
$$;

-- Cuerpo del correo. Texto plano escapado; el enlace siempre a app.maven-ai.me.
create or replace function public.notif_email_html(p_title text, p_body text, p_url text)
returns text
language sql
immutable
as $$
  with e as (
    select replace(replace(replace(coalesce(p_title, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') as t,
           replace(replace(replace(coalesce(p_body, ''),  '&', '&amp;'), '<', '&lt;'), '>', '&gt;') as b,
           'https://app.maven-ai.me'
             || case when coalesce(p_url, '') like '/%' and p_url not like '//%' and p_url not like '%"%'
                     then p_url else '/notificaciones' end as u
  )
  select '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">'
      || '<p style="margin:0 0 16px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#888">Maven</p>'
      || '<h2 style="margin:0 0 8px;font-size:18px;line-height:1.3">' || t || '</h2>'
      || case when b <> '' then '<p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#333">' || b || '</p>' else '' end
      || '<p style="margin:0 0 28px"><a href="' || u || '" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">Abrir en Maven</a></p>'
      || '<p style="margin:0;font-size:12px;color:#888">Recibes este correo porque activaste el aviso por correo de este evento en Maven → Ajustes → Notificaciones → Eventos. Ahí mismo lo puedes apagar.</p>'
      || '</div>'
  from e;
$$;

create or replace function public.email_notify_enqueue(
  p_kind text,
  p_recipients uuid[],
  p_title text,
  p_body text,
  p_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anon text;
  v_token text;
  v_base text;
  r record;
begin
  if p_recipients is null or array_length(p_recipients, 1) is null or coalesce(p_title, '') = '' then
    return;
  end if;

  for r in
    select distinct u.id, u.email
    from unnest(p_recipients) as d(uid)
    join auth.users u on u.id = d.uid
    where u.email is not null
      and public.notif_canal_activo(d.uid, p_kind, 'email')
      and not exists (
        select 1 from notification_settings ns
        where ns.user_id = d.uid and ns.notifications_enabled = false
      )
  loop
    begin
      if v_token is null then
        select decrypted_secret into v_token from vault.decrypted_secrets where name = 'cron_internal_token';
        select decrypted_secret into v_anon  from vault.decrypted_secrets where name = 'supabase_anon_key';
        select decrypted_secret into v_base  from vault.decrypted_secrets where name = 'project_url';
      end if;
      perform net.http_post(
        url := v_base || '/functions/v1/send-notification-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon,
          'apikey', v_anon,
          'X-Cron-Token', v_token
        ),
        body := jsonb_build_object(
          'to', jsonb_build_array(r.email),
          'subject', 'Maven · ' || p_title,
          'html', public.notif_email_html(p_title, p_body, p_url),
          'tag', 'aviso-' || regexp_replace(p_kind, '[^A-Za-z0-9_-]', '_', 'g')
        ),
        timeout_milliseconds := 10000
      );
    exception when others then
      raise warning 'email_notify_enqueue(%): % (usuario %)', p_kind, sqlerrm, r.id;
    end;
  end loop;
end
$$;
revoke all on function public.email_notify_enqueue(text, uuid[], text, text, text) from public, anon, authenticated;

-- push_notify_enqueue resuelve también el correo (mismos kinds, misma llamada).
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

  -- Canal correo (opt-in por evento). Va antes del filtro de push: no depende
  -- de push_enabled ni de tener un dispositivo suscrito.
  perform public.email_notify_enqueue(p_kind, p_recipients, p_title, p_body, p_url);

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

-- ─── Corrección: apagar "En Maven" no debe callar el celular ni el correo ────
-- La 20260906160000 puso un BEFORE INSERT que descartaba la fila de la campana
-- cuando el in-app del tipo estaba apagado. Pero el push y el correo salen del
-- AFTER INSERT de esa misma fila: sin fila, sin push. Quien apagaba "En Maven"
-- y dejaba "Celular" perdía los dos. La fila se guarda siempre; el canal in-app
-- lo decide el cliente (filtro de la campana y del sonido por tipo), que es
-- donde de verdad se muestra.
drop trigger if exists on_notification_gate on public.notifications;
drop function if exists public.notif_gate_in_app();

-- ─── Cowork: "alguien pide supervisor" también al celular / correo ──────────
-- Hasta hoy solo lo detectaba el cliente (useCoworkRequestAlerts, con Maven
-- abierta). Jhon (06/09/2026): "si alguien pide un supervisor, ¿por qué no
-- notificarme al celular?". Destinatarios: los hosts de la sesión, menos quien
-- pide. Mismo patrón que push_cowork_llamado.
create or replace function public.push_cowork_pedido_host()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hosts uuid[];
  v_nombre text;
  v_sala text;
begin
  if coalesce(new.status, 'open') <> 'open' then
    return null;
  end if;
  select array_agg(m.user_id) into v_hosts
  from cowork_memberships m
  where m.session_id = new.session_id
    and m.role = 'host'
    and m.user_id <> new.user_id;
  if v_hosts is null then
    return null;
  end if;
  select p.full_name into v_nombre from profiles p where p.id = new.user_id;
  if new.room_id is not null then
    select r.name into v_sala from cowork_rooms r where r.id = new.room_id;
  end if;
  perform public.push_notify_enqueue(
    'cowork_pedido_host',
    v_hosts,
    jsonb_build_object('request_id', new.id, 'session_id', new.session_id, 'user_id', new.user_id),
    coalesce(nullif(v_nombre, ''), 'Alguien') || ' pide supervisor',
    coalesce('Sala ' || nullif(v_sala, ''), 'Cowork') || coalesce(' · ' || nullif(new.message, ''), ''),
    '/cowork?session=' || new.session_id,
    'cowork-pedido-' || new.id,
    'normal'
  );
  return null;
end
$$;
revoke all on function public.push_cowork_pedido_host() from public, anon, authenticated;
drop trigger if exists on_cowork_pedido_host_push on public.cowork_host_requests;
create trigger on_cowork_pedido_host_push
  after insert on public.cowork_host_requests
  for each row execute function public.push_cowork_pedido_host();
