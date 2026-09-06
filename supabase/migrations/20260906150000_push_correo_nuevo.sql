-- Push al celular cuando llega un correo nuevo al Correo de Maven (pedido de
-- Jhon, 06/09/2026: "Maven ya tiene correo, que las notificaciones lleguen al
-- celular con la app"). El sincronizador (infra/mail-sync) hace UPSERT en
-- mail_messages: un correo nuevo entra como INSERT y acá se cuelga el aviso,
-- por el mismo camino que Cowork y la bandeja (push_notify_enqueue → edge
-- web-push, action "notify", kind "correo_nuevo").
--
-- Tres guardas para que no sea ruido:
--   · solo la bandeja de entrada (folder 'INBOX'; Newsletter, Notification,
--     Correo no deseado y Enviado no avisan) y solo correos sin leer;
--   · solo correos fechados en los últimos 30 minutos: la PRIMERA sincronización
--     de un buzón mete cientos de correos viejos y no puede disparar cientos de
--     avisos;
--   · nada de lo que la persona se envía a sí misma (from = su propia casilla).
--
-- El tag es por buzón ('correo-<user_id>'): el service worker agrupa varios
-- correos seguidos en una sola tarjeta ("3 correos nuevos"). La url abre
-- /correo (la bandeja no tiene deep link por mensaje). Respeta el opt-in
-- push_enabled como todo lo demás.
create or replace function public.push_correo_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_de text;
begin
  if new.folder <> 'INBOX' or not coalesce(new.unread, true) then
    return null;
  end if;
  if new.date is null or new.date < now() - interval '30 minutes' or new.date > now() + interval '5 minutes' then
    return null;
  end if;
  if exists (
       select 1 from mail_credentials c
       where c.user_id = new.user_id and c.revoked_at is null
         and new.from_addr ilike '%' || c.email_address || '%'
     ) or exists (
       select 1 from mail_connections c
       where c.user_id = new.user_id and c.revoked_at is null
         and new.from_addr ilike '%' || c.email_address || '%'
     ) then
    return null;
  end if;

  -- "Nombre Apellido <correo@x>" → "Nombre Apellido"; si no hay nombre, el correo.
  v_de := nullif(trim(both ' "''' from split_part(new.from_addr, '<', 1)), '');
  if v_de is null or v_de = '' then
    v_de := coalesce(nullif(trim(both ' <>' from new.from_addr), ''), 'Correo nuevo');
  end if;

  perform public.push_notify_enqueue(
    'correo_nuevo',
    array[new.user_id],
    jsonb_build_object('mail_id', new.id, 'folder', new.folder, 'uid', new.uid),
    v_de,
    coalesce(nullif(new.subject, ''), '(sin asunto)'),
    '/correo',
    'correo-' || new.user_id,
    'low'
  );
  return null;
end
$$;

revoke all on function public.push_correo_nuevo() from public, anon, authenticated;

drop trigger if exists on_mail_message_push on public.mail_messages;
create trigger on_mail_message_push
  after insert on public.mail_messages
  for each row execute function public.push_correo_nuevo();
