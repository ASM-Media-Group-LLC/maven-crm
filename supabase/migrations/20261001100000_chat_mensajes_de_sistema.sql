-- Messenger: los avisos de sistema («Ana agregó a Beto al grupo») los arma la
-- base (diseño de la escritura por API, §4.1b, PR 1b).
--
-- El problema: cualquiera con sesión podía insertar en chat_messages una fila
-- type='system' con texto libre. La política de los grupos de anuncios la deja
-- pasar (20260824200000:16-25), la burbuja la dibuja sin autor (MessageBubble.tsx)
-- y notify_chat_message la notifica a todo el grupo. Con texto libre se podía
-- inventar «Jhon Lopez nombró admin a …» y, con la API, «BLU (API): …». La
-- migración A (20260930230000) no lo cerraba.
--
-- Qué cambia:
--   1. chat_evento_sistema(_conv, _evento, _objetivo, _texto), SECURITY DEFINER,
--      arma el texto EN LA BASE a partir de un evento de una lista cerrada y del
--      full_name de quien llama (y de la persona objetivo). Los textos son
--      EXACTAMENTE los que escribía la app (ChatHeader.tsx y GroupMembersPanel.tsx
--      en main 1ab8e4fc7), con los mismos rellenos cuando falta un nombre. Son
--      dato: los lee todo el grupo y se quedan en español, no se traducen.
--        renombro      «X cambió el nombre del grupo a "N"»   X sin nombre: Alguien
--        agrego        «X agregó a Y al grupo»                 Admin / Usuario
--        acepto        «X aceptó a Y en el grupo»              Admin / Usuario
--        elimino       «X eliminó a Y del grupo»               Admin / Usuario
--        nombro_admin  «X nombró admin a Y»                    Admin / Usuario
--        quito_admin   «X quitó admin a Y»                     Admin / Usuario
--        salio         «X salió del grupo»                     Usuario
--      Lo único que viene del pedido es el nombre nuevo del grupo (renombro): se
--      le sacan los caracteres de control, de dirección (U+202E y compañía) y de
--      ancho cero, se le quitan los espacios de las puntas y tiene que quedar
--      entre 1 y 100 caracteres (la app corta en 60).
--      Quién lo puede mandar: un participante del GRUPO (en un directo no hay
--      avisos), y además
--        renombro      quien puede renombrar: un admin, o el creador si
--                      info_permission = 'all' (las dos guardas de UPDATE de
--                      chat_conversations; el banco compara una cosa con la otra);
--        agrego        un admin, o cualquiera si add_permission = 'all' (la
--                      política INSERT de chat_participants);
--        acepto, elimino, nombro_admin, quito_admin   un admin;
--        salio         cualquiera (la app manda el aviso ANTES de borrar su fila).
--      Que el evento haya pasado de verdad no se comprueba: es un aviso. Lo que ya
--      no se puede es escribir otra cosa que estos siete textos.
--   2. trg_mensajes_de_sistema (BEFORE INSERT OR UPDATE OF type, content,
--      content_rich ON chat_messages). Con sesión de usuario (auth.uid()):
--      · un INSERT type='system' solo entra si el GUC local maven.evento_sistema
--        tiene el id de ESA fila. Lo pone chat_evento_sistema justo antes de su
--        INSERT y lo apaga enseguida, como maven.borrado_autorizado en A7
--        (PostgREST no expone set_config);
--      · un aviso no se edita (la política UPDATE deja al autor cambiar el texto
--        de lo suyo), salvo borrarlo con delete_chat_message;
--      · ningún mensaje pasa a ser 'system'. Eso ya lo frena A6; aquí se sostiene
--        aunque la A vuelva atrás.
--      Sin auth.uid() (service_role, cron, migraciones) se aparta: los caminos del
--      servidor siguen pudiendo escribir avisos.
--      El nombre ordena: los BEFORE corren por orden alfabético, y «trg_m…» va
--      después de chat_messages_al_insertar y de trg_guard_chat_message_update.
--      Así lo que ya rechaza la A sigue saliendo con el error de la A (el banco
--      del PR 1 lo compara) y este trigger solo suma lo suyo.
--
-- Prod el 01/10 (solo lectura, conteos): 181 avisos de sistema, TODOS con una de
-- las siete formas de arriba y empezando con el full_name actual de su autor
-- (140 agregó, 28 nombró admin, 7 eliminó, 3 cambió el nombre, 3 salió); ninguno
-- en un directo, editado, borrado, con texto rico, archivo o cita. 131 en los
-- últimos 30 días (unos 4 por día). Ninguna función de la base ni edge function
-- inserta avisos: solo la app, en los 6 lugares que pasan a la RPC. Las huellas
-- de prod de lo que esto toca (chat_messages: columnas, constraints, triggers y
-- políticas; las funciones que usa) son las del fixture + la A: el banco
-- supabase/tests/chat_mensajes_de_sistema.ts las trae escritas y las compara.
--
-- Orden de despliegue: esta migración primero y el merge enseguida. En el medio,
-- un navegador con el frontend anterior sigue insertando el aviso directo: la
-- base lo rechaza y la app lo ignora (como ya ignoraba cualquier error de ese
-- INSERT). La acción (sumar, sacar, renombrar, salir) se hace igual; solo falta
-- el aviso. Lo mismo para una pestaña o una PWA con el bundle viejo hasta que
-- recargue. Al revés (el merge antes que la migración) la RPC no existe y TODOS
-- los avisos fallan hasta aplicarla.
--
-- Candados: crear un trigger en chat_messages pide SHARE ROW EXCLUSIVE. Deja leer
-- (SELECT y Realtime siguen), y los INSERT y UPDATE de mensajes esperan lo que
-- tarda la migración (milisegundos: no toca filas). Se pide primero, con
-- lock_timeout de 200 ms y hasta 8 intentos separados por 1 s, como en la A.
-- Las funciones no toman candados de tabla.
--
-- ─── VUELTA ATRÁS (el banco la corre tal cual: las líneas «--|») ─────────────
-- APAGA el trigger (disable: el mismo candado que crearlo; DROP TRIGGER pediría
-- ACCESS EXCLUSIVE y trabaría también las lecturas de chat_messages). Con eso los
-- avisos libres vuelven a entrar, como antes de esta migración.
-- Quedan (el banco compara la vuelta atrás contra prod + la A y exige esta lista):
--   · chat_evento_sistema: el frontend nuevo la usa, y sigue andando igual;
--   · chat_mensajes_de_sistema y el trigger trg_mensajes_de_sistema, APAGADO.
-- Arreglar hacia adelante es una migración NUEVA con «enable trigger».
--| begin;
--| do $$
--| declare _intento int := 0;
--| begin
--|   perform set_config('lock_timeout', '200ms', true);
--|   loop
--|     _intento := _intento + 1;
--|     begin
--|       lock table public.chat_messages in share row exclusive mode;
--|       exit;
--|     exception when lock_not_available or deadlock_detected then
--|       if _intento >= 8 then
--|         raise exception 'chat_candados: no se consiguieron los candados en % intentos; la vuelta atrás no hizo nada, se vuelve a correr más tarde', _intento;
--|       end if;
--|       perform pg_sleep(1);
--|     end;
--|   end loop;
--|   perform set_config('lock_timeout', '3s', true);
--| end $$;
--| alter table public.chat_messages disable trigger trg_mensajes_de_sistema;
--| commit;
-- ─────────────────────────────────────────────────────────────────────────────

set lock_timeout = '3s';

-- ════ 0. El candado, al principio ════════════════════════════════════════════
do $$
declare
  _intento int := 0;
begin
  perform set_config('lock_timeout', '200ms', true);
  loop
    _intento := _intento + 1;
    begin
      lock table public.chat_messages in share row exclusive mode;  -- CREATE TRIGGER
      exit;
    exception when lock_not_available or deadlock_detected then
      if _intento >= 8 then
        raise exception 'chat_candados: no se consiguieron los candados en % intentos; no quedó nada aplicado, se vuelve a correr más tarde', _intento;
      end if;
      perform pg_sleep(1);
    end;
  end loop;
  perform set_config('lock_timeout', '3s', true);
end $$;

-- ════ 1. La RPC que arma el aviso ════════════════════════════════════════════
-- DEFINER: inserta como dueño de la tabla (sin la RLS), así que las reglas de
-- quién puede están aquí adentro. sender_id es siempre quien llama.
create or replace function public.chat_evento_sistema(
  _conv uuid,
  _evento text,
  _objetivo uuid default null,
  _texto text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _conversacion record;
  _actor text;
  _otro text;
  _nombre text;
  _contenido text;
  _id uuid := gen_random_uuid();
begin
  if _uid is null then
    raise exception 'chat_evento_sin_sesion: los avisos de sistema los manda una persona con sesión';
  end if;
  if _evento is null
     or _evento not in ('renombro', 'agrego', 'acepto', 'elimino', 'nombro_admin', 'quito_admin', 'salio') then
    raise exception 'chat_evento_desconocido: ese evento no existe';
  end if;

  -- Quien no participa no se entera de si la conversación existe.
  if not public.is_chat_participant(_uid, _conv) then
    raise exception 'chat_evento_no_autorizado: quien manda el aviso no participa de esa conversación';
  end if;
  select c.type, c.created_by, c.info_permission, c.add_permission into _conversacion
    from public.chat_conversations c
   where c.id = _conv;
  if _conversacion.type is distinct from 'group' then
    raise exception 'chat_evento_no_es_grupo: los avisos de sistema son de los grupos';
  end if;
  if not (public.is_chat_admin(_uid, _conv)
          or _evento = 'salio'
          or (_evento = 'agrego' and _conversacion.add_permission = 'all')
          or (_evento = 'renombro' and _conversacion.created_by = _uid
              and coalesce(_conversacion.info_permission, 'admins') = 'all')) then
    raise exception 'chat_evento_no_autorizado: ese aviso lo manda un admin del grupo';
  end if;

  -- La persona objetivo: la necesitan todos menos renombrar y salir.
  if _evento in ('renombro', 'salio') then
    if _objetivo is not null then
      raise exception 'chat_evento_objetivo: ese aviso no lleva persona objetivo';
    end if;
  else
    if _objetivo is null or not exists (select 1 from public.profiles p where p.id = _objetivo) then
      raise exception 'chat_evento_objetivo: ese aviso necesita a la persona a la que le pasó';
    end if;
    _otro := coalesce(nullif((select p.full_name from public.profiles p where p.id = _objetivo), ''), 'Usuario');
  end if;

  -- El único texto del pedido: el nombre nuevo del grupo.
  if _evento = 'renombro' then
    _nombre := regexp_replace(coalesce(_texto, ''),
      '[\u0001-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u2028-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]', '', 'g');
    _nombre := regexp_replace(_nombre,
      '^[[:space:]\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+|[[:space:]\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+$', '', 'g');
    if char_length(_nombre) not between 1 and 100 then
      raise exception 'chat_evento_texto: el nombre del grupo tiene que tener entre 1 y 100 caracteres';
    end if;
  elsif _texto is not null then
    raise exception 'chat_evento_texto: solo el cambio de nombre lleva texto';
  end if;

  -- Los rellenos son los de la app: «Alguien» al renombrar, «Usuario» al salir y
  -- «Admin» en lo demás (los hace un admin).
  _actor := coalesce(nullif((select p.full_name from public.profiles p where p.id = _uid), ''),
                     case _evento when 'renombro' then 'Alguien' when 'salio' then 'Usuario' else 'Admin' end);
  _contenido := case _evento
    when 'renombro'     then format('%s cambió el nombre del grupo a "%s"', _actor, _nombre)
    when 'agrego'       then format('%s agregó a %s al grupo', _actor, _otro)
    when 'acepto'       then format('%s aceptó a %s en el grupo', _actor, _otro)
    when 'elimino'      then format('%s eliminó a %s del grupo', _actor, _otro)
    when 'nombro_admin' then format('%s nombró admin a %s', _actor, _otro)
    when 'quito_admin'  then format('%s quitó admin a %s', _actor, _otro)
    when 'salio'        then format('%s salió del grupo', _actor)
  end;

  -- El permiso vale para ESTA fila y se apaga enseguida (local a la transacción).
  perform set_config('maven.evento_sistema', _id::text, true);
  insert into public.chat_messages (id, conversation_id, sender_id, type, content)
  values (_id, _conv, _uid, 'system', _contenido);
  perform set_config('maven.evento_sistema', '', true);
  return _id;
end;
$$;
revoke all on function public.chat_evento_sistema(uuid, text, uuid, text) from public, anon;
grant execute on function public.chat_evento_sistema(uuid, text, uuid, text) to authenticated;
comment on function public.chat_evento_sistema(uuid, text, uuid, text) is
  'Avisos de sistema del Messenger: el texto lo arma la base con un evento (renombro, agrego, acepto, elimino, nombro_admin, quito_admin, salio) y los nombres de profiles. Lo único libre es el nombre nuevo del grupo, limpio.';

-- ════ 2. La guarda de chat_messages ══════════════════════════════════════════
create or replace function public.chat_mensajes_de_sistema()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.type = 'system'
       and current_setting('maven.evento_sistema', true) is distinct from new.id::text then
      raise exception 'chat_sistema_sin_evento: los avisos de sistema los arma la base (chat_evento_sistema)';
    end if;
    return new;
  end if;
  if new.type = 'system' and old.type is distinct from 'system' then
    raise exception 'chat_sistema_sin_evento: un mensaje no pasa a ser un aviso de sistema';
  end if;
  if old.type = 'system'
     and (new.content is distinct from old.content or new.content_rich is distinct from old.content_rich)
     and not (new.is_deleted and not old.is_deleted and new.content is null and new.content_rich is null) then
    raise exception 'chat_sistema_inmutable: un aviso de sistema no se edita';
  end if;
  return new;
end;
$$;
revoke all on function public.chat_mensajes_de_sistema() from public, anon, authenticated;

create trigger trg_mensajes_de_sistema
  before insert or update of type, content, content_rich on public.chat_messages
  for each row execute function public.chat_mensajes_de_sistema();

reset lock_timeout;
