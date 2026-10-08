-- MENSAJES PROGRAMADOS DEL MESSENGER: «Programar envío», como Google Chat
-- (Jhon, 08/10/2026). Banco: supabase/tests/chat_programados.ts.
--
-- La flechita pegada al botón de enviar guarda el mensaje acá con su hora, y
-- chat_programados_enviar() —un cron de cada minuto, ver la migración del cron—
-- lo inserta en chat_messages A NOMBRE de quien lo escribió cuando llega la
-- hora. Los avisos, el push y las menciones salen de los triggers de siempre
-- (miran new.sender_id, no la sesión).
--
-- Un programado son UNO O VARIOS mensajes (`mensajes`, en orden): el texto, o
-- los archivos que se adjuntaron (ya subidos a chat-files al programar) con el
-- texto como pie, igual que los manda la app.
--
-- ⚠️ El cron inserta SIN sesión (rol postgres). Sin sesión, chat_messages_al_insertar
-- no revisa la cita ni el archivo, y la RLS no mira si sigue en la conversación.
-- Por eso chat_programado_revisar() lo revisa TODO dos veces: al programar
-- (con la sesión de la persona) y al salir (alguien pudo salir del grupo, o
-- dejar de ser admin de un grupo de anuncios, entre una cosa y la otra).
--
-- QUIÉN TOCA QUÉ: la persona ve los suyos, los crea con chat_programar() y los
-- cancela con chat_programado_cancelar(). Nadie escribe la tabla a mano.
--
-- Vuelta atrás (las líneas «--|»; el banco las corre):
--| drop function public.chat_programados_enviar();
--| drop function public.chat_programado_cancelar(uuid);
--| drop function public.chat_programar(uuid, timestamptz, jsonb);
--| drop function public.chat_programado_revisar(uuid, uuid, jsonb);
--| drop table public.chat_programados;

create table public.chat_programados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  enviar_en timestamptz not null,
  estado text not null default 'pendiente',
  -- [{content, type, file_url, file_name, reply_to_id, album_id, is_thread_reply, content_rich}]
  mensajes jsonb not null,
  resumen text not null default '',
  ultimo_error text,
  creado_en timestamptz not null default now(),
  cerrado_en timestamptz,
  constraint chat_programados_estado check (estado in ('pendiente', 'enviado', 'fallido', 'cancelado')),
  constraint chat_programados_mensajes check (
    jsonb_typeof(mensajes) = 'array' and jsonb_array_length(mensajes) between 1 and 20
  )
);
create index chat_programados_vencen_idx on public.chat_programados (enviar_en) where estado = 'pendiente';
create index chat_programados_persona_idx on public.chat_programados (user_id, conversation_id, enviar_en);
comment on table public.chat_programados is
  'Mensajes programados del Messenger. Los crea chat_programar(), los manda chat_programados_enviar() (cron). Ver 20261008170000.';

alter table public.chat_programados enable row level security;
revoke all on table public.chat_programados from public, anon, authenticated;
grant select on table public.chat_programados to authenticated;
create policy chat_programados_los_mios on public.chat_programados
  for select to authenticated
  using (user_id = (select auth.uid()));
grant select, insert, update, delete on table public.chat_programados to service_role;

-- ─── La revisión: null = se puede mandar; si no, el motivo ─────────────────
create function public.chat_programado_revisar(p_user uuid, p_conversation uuid, p_mensajes jsonb)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  m jsonb;
  tipo text;
begin
  if not public.is_chat_participant(p_user, p_conversation) then
    return 'ya no estás en esta conversación';
  end if;
  if exists (select 1 from public.chat_conversations c
              where c.id = p_conversation and c.type = 'group' and c.msg_permission = 'admins')
     and not public.is_chat_admin(p_user, p_conversation) then
    return 'en este grupo solo escriben los administradores';
  end if;
  if jsonb_typeof(p_mensajes) is distinct from 'array'
     or jsonb_array_length(p_mensajes) not between 1 and 20 then
    return 'el mensaje está vacío';
  end if;
  for m in select value from jsonb_array_elements(p_mensajes) loop
    if jsonb_typeof(m) is distinct from 'object' then return 'un mensaje viene con formato inválido'; end if;
    tipo := m ->> 'type';
    -- Nunca un aviso de sistema: esos los arma la base (chat_evento_sistema).
    if tipo is null or tipo not in ('text', 'image', 'file') then return 'un mensaje viene con un tipo inválido'; end if;
    if char_length(coalesce(m ->> 'content', '')) > 20000 then return 'un mensaje es demasiado largo'; end if;
    if tipo = 'text' and btrim(coalesce(m ->> 'content', '')) = '' then return 'el mensaje está vacío'; end if;
    if tipo <> 'text' and nullif(m ->> 'file_url', '') is null then return 'falta el archivo'; end if;
    -- Lo mismo que chat_messages_al_insertar, que sin sesión no corre.
    if nullif(m ->> 'file_url', '') is not null
       and (m ->> 'file_url') !~ '^https://lsagslbkliprespbyhts\.supabase\.co/storage/v1/object/public/chat-files/'
       and (m ->> 'file_url') !~ '^https://media[0-9]*\.giphy\.com/' then
      return 'el archivo tiene que estar en el almacenamiento de Maven';
    end if;
    if nullif(m ->> 'reply_to_id', '') is not null then
      if (m ->> 'reply_to_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or not exists (select 1 from public.chat_messages r
                         where r.id = (m ->> 'reply_to_id')::uuid and r.conversation_id = p_conversation) then
        return 'el mensaje que respondes ya no está en esta conversación';
      end if;
    end if;
    if nullif(m ->> 'album_id', '') is not null
       and (m ->> 'album_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return 'un mensaje viene con formato inválido';
    end if;
  end loop;
  return null;
end $$;
revoke all on function public.chat_programado_revisar(uuid, uuid, jsonb) from public, anon, authenticated;

-- ─── Programar (la persona, con su sesión) ──────────────────────────────────
create function public.chat_programar(p_conversation_id uuid, p_enviar_en timestamptz, p_mensajes jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  yo uuid := (select auth.uid());
  motivo text;
  nuevo uuid;
  primero jsonb;
begin
  if yo is null then raise exception 'chat_programar: hace falta una sesión' using errcode = '42501'; end if;
  -- La pared de la API: una función DEFINER no pasa por las políticas, así que
  -- una sesión fabricada con una key no puede usarla para escribir en el chat.
  if (auth.jwt() ?| array['mvf', 'mvk']) is true then
    raise exception using errcode = 'MV403',
      message = 'api_programar_no_por_api: programar se hace desde Maven, no con una key',
      detail = '{"error": "forbidden"}';
  end if;
  -- Unos segundos en el pasado se aceptan (el reloj siguió andando mientras se
  -- elegía); más, no. Y hasta un año, como el Correo.
  if p_enviar_en is null or p_enviar_en < now() - interval '5 minutes' then
    raise exception 'esa hora ya pasó' using errcode = 'MV422';
  end if;
  if p_enviar_en > now() + interval '366 days' then
    raise exception 'se puede programar hasta un año adelante' using errcode = 'MV422';
  end if;
  motivo := public.chat_programado_revisar(yo, p_conversation_id, p_mensajes);
  if motivo is not null then raise exception '%', motivo using errcode = 'MV422'; end if;
  if (select count(*) from public.chat_programados where user_id = yo and estado = 'pendiente') >= 100 then
    raise exception 'ya tienes 100 mensajes programados' using errcode = 'MV429';
  end if;

  -- El resumen de la lista: el texto (o el nombre del archivo) del primero que
  -- tenga algo que mostrar.
  select value into primero from jsonb_array_elements(p_mensajes)
   where coalesce(nullif(btrim(value ->> 'content'), ''), nullif(value ->> 'file_name', '')) is not null
   limit 1;
  insert into public.chat_programados (user_id, conversation_id, enviar_en, mensajes, resumen)
  values (
    yo, p_conversation_id, p_enviar_en, p_mensajes,
    left(coalesce(nullif(btrim(primero ->> 'content'), ''), primero ->> 'file_name', ''), 200)
  )
  returning id into nuevo;
  return nuevo;
end $$;
revoke all on function public.chat_programar(uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.chat_programar(uuid, timestamptz, jsonb) to authenticated;

-- ─── Cancelar (devuelve los mensajes, para volver a ponerlos en el cajón) ──
create function public.chat_programado_cancelar(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.chat_programados;
begin
  -- La pared de la API (ver chat_programar).
  if (auth.jwt() ?| array['mvf', 'mvk']) is true then
    raise exception using errcode = 'MV403',
      message = 'api_programar_no_por_api: programar se hace desde Maven, no con una key',
      detail = '{"error": "forbidden"}';
  end if;
  update public.chat_programados
     set estado = 'cancelado', cerrado_en = now()
   where id = p_id and user_id = (select auth.uid()) and estado in ('pendiente', 'fallido')
  returning * into r;
  if r.id is null then return null; end if;
  return jsonb_build_object('id', r.id, 'conversation_id', r.conversation_id, 'enviar_en', r.enviar_en, 'mensajes', r.mensajes);
end $$;
revoke all on function public.chat_programado_cancelar(uuid) from public, anon;
grant execute on function public.chat_programado_cancelar(uuid) to authenticated;

-- ─── Mandar los vencidos (el cron) ──────────────────────────────────────────
-- Cada programado en su propia subtransacción: si uno falla, sus mensajes no
-- quedan a medias y los demás salen igual. El que falla queda «fallido» con el
-- motivo y a la persona le llega un aviso. No se reintenta solo.
create function public.chat_programados_enviar()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  m jsonb;
  motivo text;
  enviados integer := 0;
begin
  for r in
    select p.* from public.chat_programados p
     where p.estado = 'pendiente' and p.enviar_en <= now()
     order by p.enviar_en
     limit 50
     for update skip locked
  loop
    begin
      motivo := public.chat_programado_revisar(r.user_id, r.conversation_id, r.mensajes);
      if motivo is not null then raise exception '%', motivo using errcode = 'MV422'; end if;
      for m in select value from jsonb_array_elements(r.mensajes) loop
        insert into public.chat_messages (
          conversation_id, sender_id, content, type, file_url, file_name,
          reply_to_id, album_id, is_thread_reply, content_rich, created_at
        ) values (
          r.conversation_id, r.user_id, m ->> 'content', m ->> 'type',
          nullif(m ->> 'file_url', ''), nullif(m ->> 'file_name', ''),
          nullif(m ->> 'reply_to_id', '')::uuid, nullif(m ->> 'album_id', '')::uuid,
          coalesce((m ->> 'is_thread_reply')::boolean, false),
          nullif(m -> 'content_rich', 'null'::jsonb),
          -- clock_timestamp y no now(): en la misma transacción now() es UNO
          -- solo, y el texto y sus archivos empatarían en el orden del chat.
          clock_timestamp()
        );
      end loop;
      update public.chat_conversations set updated_at = now() where id = r.conversation_id;
      update public.chat_programados set estado = 'enviado', cerrado_en = now(), ultimo_error = null where id = r.id;
      enviados := enviados + 1;
    exception when others then
      update public.chat_programados
         set estado = 'fallido', cerrado_en = now(), ultimo_error = left(sqlerrm, 500)
       where id = r.id;
      insert into public.notifications (
        user_id, type, title, message, reference_id, reference_type,
        module_origin, priority, status, deep_link_url, required_permission_module
      ) values (
        r.user_id, 'chat_programado_fallido', 'No se pudo enviar tu mensaje programado',
        left(coalesce(nullif(r.resumen, ''), 'Mensaje') || ': ' || sqlerrm, 300),
        r.conversation_id, 'conversation', 'messenger', 'high', 'new',
        '/messenger?c=' || r.conversation_id, 'Messenger'
      );
    end;
  end loop;

  -- Lo que ya cumplió no se guarda para siempre.
  delete from public.chat_programados
   where estado in ('enviado', 'cancelado') and cerrado_en < now() - interval '30 days';
  return enviados;
end $$;
revoke all on function public.chat_programados_enviar() from public, anon, authenticated;
