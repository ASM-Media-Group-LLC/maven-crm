-- Messenger: cada conversación es de UNA agencia, y los huecos de la base que ya
-- estaban abiertos con o sin API (diseño de la escritura por API, §4.1, PR 1).
--
-- Los huecos, con el nombre que les pone el banco supabase/tests/chat_agencia_y_huecos.ts
-- (que los prueba ABIERTOS sobre el esquema de prod del 28/09 y CERRADOS después
-- de esta migración):
--   A. mover la participación propia a otra conversación y quedar adentro como admin
--      (la política UPDATE de chat_participants no tiene WITH CHECK y la guarda
--      mira el admin de la conversación VIEJA);
--   B. cambiarle el user_id a una participación (sumar a cualquiera sin pasar por
--      la política INSERT);
--   C. cambiar created_by o type de una conversación (con created_by propio se
--      borra el grupo entero; con type='direct' se saltan los permisos);
--   D. un tercero en un directo (de una, o sacando al otro y sumando al tercero);
--   E. un mensaje con fecha atrasada, resucitado (is_deleted true→false) o con
--      type/album/hilo/cita/archivo movidos por UPDATE;
--   F. borrar sin dejar archivo (UPDATE is_deleted=true directo, o DELETE duro);
--   G. re-insertarse o sumar a alguien como admin sin serlo;
--   H. cambiarse el full_name desde la app.
--
-- Qué cambia, en el orden en que va (ver «Orden y candados» abajo):
--   A8  sin DELETE duro de mensajes (la app borra por delete_chat_message).
--   A6  guard_chat_message_update cierra E y la parte UPDATE de F.
--   A7  delete_chat_message archiva y vacía también content_rich y file_size, y es
--       lo único que puede pasar is_deleted a true (GUC maven.borrado_autorizado).
--   A1  chat_conversations.tenant_id, sin UPDATE de relleno (default constante =
--       solo metadatos: no reescribe filas, no corre el trigger de updated_at, no
--       manda un evento de Realtime por conversación; el orden de la bandeja no se
--       mueve). El DO falla si no hay exactamente una agencia.
--   A2  chat_conversations_agencia (BEFORE INSERT): la agencia sale de quien crea,
--       nunca del pedido; created_at := now().
--   A9  el grupo 31 de una persona en 24 horas se rechaza (tope aprobado por Jhon;
--       el máximo que hubo en prod fue 9 en un día).
--   A3  el mismo trigger en BEFORE UPDATE: tenant_id, type, created_by y created_at
--       no cambian nunca, lo haga quien lo haga (cierra C).
--   A4  chat_participants_agencia (BEFORE INSERT OR UPDATE OF user_id, conversation_id):
--       una participación no se mueve (A, B); quien entra y quien suma son de la
--       agencia de la conversación; sin ser admin solo se suma a otro como member,
--       y a uno mismo solo el creador en su conversación todavía vacía (G).
--   A5  en un directo: candado por conversación, rechazo del tercero (D),
--       'directo_duplicado' si esas dos personas ya tienen otro directo, y nadie
--       entra a un directo con mensajes de alguien que ya no está (D por la
--       puerta de atrás: el creador saca al otro y suma a un tercero).
--   A5b chat_directo_con(_otro): el directo canónico entre yo y el otro, para que
--       la app y la API elijan el mismo.
--   A10 profiles.full_name no se cambia con sesión de usuario (H); el admin lo
--       cambia con service_role (admin-user-actions). No toca el INSERT de
--       handle_new_user.
--   A11 get_unread_counts cuenta hasta 101 por conversación, como
--       messenger_unread_counts: el costo deja de crecer con los no leídos viejos.
--
-- ⚠️ Lo que el diseño pedía y NO va aquí:
--   · A10, la mitad del «esqueleto de un nombre visible»: la columna
--     api_keys.api_display_name nace en la migración B (PR 2). Esa parte la suma B,
--     sobre esta misma función.
--
-- El nombre: el diseño la llamaba 20260929100000, pero esa versión ya está aplicada
-- en prod (drive_cupos_nombre_o_correo). Dos migraciones con la misma versión
-- chocan en supabase_migrations.schema_migrations. Y tiene que ir DESPUÉS de la
-- última aplicada (20260929180000 funciones_sin_voseo, 29/09): una versión
-- anterior queda «insertada antes de la última» y `supabase db push` la rechaza
-- sin --include-all. 20260929200000 ya la usa la rama del reloj de Cowork: por
-- eso 20260929210000.
--
-- Diferencias de prod contra el repo que esto respeta (el catálogo de prod manda;
-- sacado el 28/09 y vuelto a comparar el 29/09, sin cambios):
--   · guard_chat_message_update y delete_chat_message tienen en prod otro texto que
--     en sus migraciones (misma lógica). Se reemplazan enteras.
--   · chat_reactions ya no está en la publicación de Realtime.
--   · El hueco A no se abre por PostgREST: un UPDATE con WHERE exige que la fila
--     NUEVA también pase la política SELECT (hay que ser ya participante de la
--     conversación destino, y ahí choca con la UNIQUE), y el rol authenticator de
--     prod precarga safeupdate (no hay UPDATE sin WHERE). Sigue abierto para
--     service_role, y B sí se abre por PostgREST: por eso A4 cierra el UPDATE de
--     user_id y conversation_id para todos.
--
-- Orden y candados. Todo va en una transacción; cada ALTER / CREATE TRIGGER /
-- DROP POLICY toma un candado fuerte sobre su tabla hasta el commit. Van en el mismo
-- orden en que los toma un INSERT de mensaje (chat_messages → chat_conversations →
-- chat_participants → profiles) para no armar un ciclo con él, y con lock_timeout
-- de 3 s: si alguien tiene la tabla tomada, la migración se rinde en vez de dejar
-- una cola detrás suyo. Si pasa, se vuelve a correr.

set lock_timeout = '3s';

-- ════ chat_messages ══════════════════════════════════════════════════════════

-- ─── A8: sin DELETE duro de mensajes ─────────────────────────────────────────
-- La política dejaba al autor borrar la fila, y con ella el archivo de admins (FK
-- en cascada de chat_message_deletions). La app borra por la RPC (useChat.ts).
-- delete_conversation_cascade es SECURITY DEFINER y no depende de esta política.
drop policy if exists "Users can delete their own messages" on public.chat_messages;

-- ─── A6: qué puede cambiar un UPDATE de mensaje ──────────────────────────────
-- La app solo manda {content, is_edited, content_rich} (editar) y borra por RPC.
-- Pasar a NULL reply_to_id o un file_* se deja: lo hace el ON DELETE SET NULL de
-- la cita y delete_chat_message. Sin auth.uid() (service_role, migraciones) se
-- aparta, como siempre.
CREATE OR REPLACE FUNCTION public.guard_chat_message_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
  THEN RAISE EXCEPTION 'No autorizado: no se puede mover un mensaje ni cambiar su autor'; END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.album_id IS DISTINCT FROM OLD.album_id
     OR NEW.is_thread_reply IS DISTINCT FROM OLD.is_thread_reply
  THEN RAISE EXCEPTION 'chat_mensaje_inmutable: la fecha, el tipo, el álbum y el hilo de un mensaje no cambian'; END IF;

  IF (NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id AND NEW.reply_to_id IS NOT NULL)
     OR (NEW.file_url IS DISTINCT FROM OLD.file_url AND NEW.file_url IS NOT NULL)
     OR (NEW.file_name IS DISTINCT FROM OLD.file_name AND NEW.file_name IS NOT NULL)
     OR (NEW.file_size IS DISTINCT FROM OLD.file_size AND NEW.file_size IS NOT NULL)
  THEN RAISE EXCEPTION 'chat_mensaje_inmutable: la cita y el archivo de un mensaje no se cambian por otros'; END IF;

  IF OLD.is_deleted THEN
    IF NOT NEW.is_deleted THEN
      RAISE EXCEPTION 'chat_mensaje_borrado: un mensaje borrado no vuelve';
    END IF;
    IF (NEW.content IS DISTINCT FROM OLD.content AND NEW.content IS NOT NULL)
       OR (NEW.content_rich IS DISTINCT FROM OLD.content_rich AND NEW.content_rich IS NOT NULL) THEN
      RAISE EXCEPTION 'chat_mensaje_borrado: un mensaje borrado no se edita';
    END IF;
  ELSIF NEW.is_deleted THEN
    -- Solo delete_chat_message, que archiva antes y deja el GUC con ESTE id.
    IF current_setting('maven.borrado_autorizado', true) IS DISTINCT FROM OLD.id::text THEN
      RAISE EXCEPTION 'chat_borrado_sin_archivo: un mensaje se borra con delete_chat_message';
    END IF;
    IF NEW.content IS NOT NULL OR NEW.content_rich IS NOT NULL
       OR NEW.file_url IS NOT NULL OR NEW.file_name IS NOT NULL OR NEW.file_size IS NOT NULL THEN
      RAISE EXCEPTION 'chat_borrado_sin_archivo: un mensaje borrado queda vacío';
    END IF;
  END IF;
  RETURN NEW;
END; $function$;

-- ════ chat_message_deletions + A7 ════════════════════════════════════════════

-- ─── A7: el borrado archiva y vacía también el texto rico ───────────────────
-- Antes content_rich quedaba legible para cualquier participante después de
-- borrar (44 filas en prod el 29/09, y suben con cada borrado) y no llegaba al
-- archivo de admins. Esta migración no toca filas: los borrados de antes quedan
-- como estaban (limpiarlos es una decisión aparte, ver el PR).
alter table public.chat_message_deletions add column content_rich jsonb;

CREATE OR REPLACE FUNCTION public.delete_chat_message(p_message_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller uuid := auth.uid();
  m record;
begin
  if v_caller is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select id, conversation_id, sender_id, content, content_rich, type, file_url, file_name, file_size, is_deleted
    into m
  from chat_messages
  where id = p_message_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if m.is_deleted then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if m.sender_id <> v_caller then
    return jsonb_build_object('ok', false, 'error', 'not_author');
  end if;

  insert into chat_message_deletions (
    message_id, conversation_id, sender_id, deleted_by,
    content, content_rich, type, file_url, file_name, file_size
  ) values (
    m.id, m.conversation_id, m.sender_id, v_caller,
    m.content, m.content_rich, m.type, m.file_url, m.file_name, m.file_size
  )
  on conflict (message_id) do nothing;

  -- El permiso para pasar is_deleted a true vale para ESTE mensaje y se apaga
  -- enseguida (local a la transacción; PostgREST no expone set_config).
  perform set_config('maven.borrado_autorizado', m.id::text, true);
  update chat_messages
     set is_deleted = true, content = null, content_rich = null,
         file_url = null, file_name = null, file_size = null
   where id = m.id;
  perform set_config('maven.borrado_autorizado', '', true);

  return jsonb_build_object('ok', true);
end;
$function$;

-- ════ chat_conversations ═════════════════════════════════════════════════════

-- ─── A1: la agencia de cada conversación ─────────────────────────────────────
do $$
declare
  _agencias int;
  _agencia uuid;
begin
  select count(*) into _agencias from public.tenants;
  if _agencias <> 1 then
    raise exception 'chat_agencia: hay % agencias; esta migración les pone a las conversaciones la única que hay y no sabe elegir entre varias', _agencias;
  end if;
  select id into _agencia from public.tenants;
  -- Default constante: desde PG 11 queda en el catálogo (attmissingval), sin
  -- reescribir filas ni disparar triggers. La FK solo lee.
  execute format(
    'alter table public.chat_conversations add column tenant_id uuid not null default %L references public.tenants(id)',
    _agencia
  );
  -- Las filas viejas conservan su valor; las nuevas las llena el trigger de abajo.
  alter table public.chat_conversations alter column tenant_id drop default;
end $$;

-- Para el tope de A9 (y para "mis conversaciones de hoy").
create index chat_conversations_creador_fecha on public.chat_conversations (created_by, created_at);

-- ─── A2 + A3 + A9 ────────────────────────────────────────────────────────────
create or replace function public.chat_conversations_agencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _agencia uuid;
  _agencias int;
begin
  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id
       or new.type is distinct from old.type
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'chat_conversacion_inmutable: la agencia, el tipo, el creador y la fecha de una conversación no cambian';
    end if;
    return new;
  end if;

  -- INSERT. La agencia es la de quien crea (la membresía más vieja, como
  -- current_tenant_id); lo que mande el pedido se ignora.
  if _uid is not null then
    _agencia := public.current_tenant_id();
  else
    select tm.tenant_id into _agencia
      from public.tenant_members tm
     where tm.user_id = new.created_by
     order by tm.created_at asc
     limit 1;
  end if;
  if _agencia is null then
    select count(*) into _agencias from public.tenants;
    if _agencias = 1 then
      select id into _agencia from public.tenants;
    else
      raise exception 'chat_sin_agencia: quien crea la conversación no es de ninguna agencia';
    end if;
  end if;
  new.tenant_id := _agencia;

  if _uid is not null then
    -- La fecha la pone la base: si no, un created_at atrasado esquiva el tope.
    new.created_at := now();

    -- A9: 30 grupos nuevos por persona en 24 horas. El candado por persona hace
    -- que dos altas a la vez no pasen las dos con 29; la cuenta de abajo corre con
    -- una foto nueva (función VOLATILE), así que ve lo que la otra ya confirmó.
    if new.type = 'group' then
      perform pg_advisory_xact_lock(hashtextextended('chat_grupos_por_dia:' || _uid::text, 0));
      if (select count(*) from (
            select 1 from public.chat_conversations c
             where c.created_by = _uid and c.type = 'group'
               and c.created_at > now() - interval '24 hours'
             limit 30) x) >= 30 then
        raise exception 'chat_tope_grupos: ya creaste 30 grupos en las últimas 24 horas';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.chat_conversations_agencia() from public, anon, authenticated;

create trigger chat_conversations_agencia
  before insert or update of tenant_id, type, created_by, created_at on public.chat_conversations
  for each row execute function public.chat_conversations_agencia();

-- ════ chat_participants ══════════════════════════════════════════════════════

-- ─── A5: la llave de un par de personas (el orden no importa) ────────────────
create or replace function public.chat_llave_de_par(_a uuid, _b uuid)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select hashtextextended('chat_par:' || least(_a, _b)::text || ':' || greatest(_a, _b)::text, 0)
$$;
revoke all on function public.chat_llave_de_par(uuid, uuid) from public, anon;
grant execute on function public.chat_llave_de_par(uuid, uuid) to authenticated, service_role;

-- ─── A4 + A5 ─────────────────────────────────────────────────────────────────
-- DEFINER porque tiene que ver tenant_members de OTRA persona (su RLS solo deja
-- ver la fila propia) y la conversación antes de que el creador sea participante.
create or replace function public.chat_participants_agencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _conv record;
  _hay int;
  _otro uuid;
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id
       or new.conversation_id is distinct from old.conversation_id then
      raise exception 'chat_participacion_inmutable: una participación no se mueve de conversación ni cambia de persona';
    end if;
    return new;
  end if;

  select c.id, c.type, c.tenant_id, c.created_by into _conv
    from public.chat_conversations c
   where c.id = new.conversation_id;
  if not found then
    return new;  -- la FK la rechaza
  end if;

  -- La persona que entra, y quien la suma, son de la agencia de la conversación.
  if not exists (select 1 from public.tenant_members tm
                  where tm.user_id = new.user_id and tm.tenant_id = _conv.tenant_id) then
    raise exception 'chat_otra_agencia: esa persona no es de la agencia de la conversación';
  end if;
  if _uid is not null then
    if not exists (select 1 from public.tenant_members tm
                    where tm.user_id = _uid and tm.tenant_id = _conv.tenant_id) then
      raise exception 'chat_otra_agencia: quien suma no es de la agencia de la conversación';
    end if;

    -- Sin ser admin: a otro, solo como member (la política decide si se puede);
    -- a uno mismo, solo el creador en su conversación todavía vacía. Así nadie
    -- vuelve solo a un grupo del que lo sacaron, ni entra como admin.
    if not public.is_chat_admin(_uid, new.conversation_id)
       and (new.role <> 'member' or new.user_id = _uid)
       and not (new.user_id = _uid
                and _conv.created_by = _uid
                and not exists (select 1 from public.chat_participants p
                                 where p.conversation_id = new.conversation_id)) then
      raise exception 'chat_rol_no_autorizado: solo un admin suma admins, y a uno mismo solo se suma el creador al crear';
    end if;
  end if;

  if _conv.type = 'direct' then
    -- Uno a la vez por conversación: sin esto, dos altas simultáneas ven 1 y
    -- entran las dos. Las filas anteriores de la misma sentencia sí se ven.
    perform pg_advisory_xact_lock(hashtextextended('chat_directo:' || new.conversation_id::text, 0));
    select count(*) into _hay from public.chat_participants p where p.conversation_id = new.conversation_id;
    if _hay >= 2 then
      raise exception 'directo_lleno: un chat directo es de dos personas';
    end if;
    if _hay = 1 then
      select p.user_id into _otro from public.chat_participants p where p.conversation_id = new.conversation_id;
      if _otro is distinct from new.user_id then
        -- Uno a la vez por par: el segundo que llega ve el directo que el primero
        -- ya confirmó (foto nueva después del candado).
        perform pg_advisory_xact_lock(public.chat_llave_de_par(_otro, new.user_id));
        if exists (select 1
                     from public.chat_conversations c
                     join public.chat_participants a on a.conversation_id = c.id and a.user_id = _otro
                     join public.chat_participants b on b.conversation_id = c.id and b.user_id = new.user_id
                    where c.type = 'direct' and c.id <> new.conversation_id) then
          raise exception 'directo_duplicado: ya hay un chat directo entre esas dos personas';
        end if;
      end if;
    end if;
    -- Un directo no cambia de interlocutor: el admin de un directo (su creador)
    -- puede sacar al otro y, sin esto, sumar a un tercero que lee toda la
    -- conversación anterior. Entra solo quien no encuentra mensajes de nadie más
    -- que de él y de quien ya está. La app nunca suma a nadie a un directo viejo:
    -- sus dos altas van antes del primer mensaje (y si el creador escribe antes
    -- de que termine el tercer paso, el mensaje es de quien ya está).
    if exists (select 1 from public.chat_messages m
                where m.conversation_id = new.conversation_id
                  and m.sender_id is distinct from new.user_id
                  and m.sender_id is distinct from _otro) then
      raise exception 'directo_con_historia_ajena: en este directo hay mensajes de alguien que ya no está';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.chat_participants_agencia() from public, anon, authenticated;

create trigger chat_participants_agencia
  before insert or update of user_id, conversation_id on public.chat_participants
  for each row execute function public.chat_participants_agencia();

-- ════ profiles ═══════════════════════════════════════════════════════════════

-- ─── A10: el nombre lo cambia un admin ───────────────────────────────────────
-- La app nunca cambia full_name como authenticated; lo hace admin-user-actions con
-- service_role (sin auth.uid()). Solo UPDATE OF full_name: handle_new_user (INSERT)
-- no pasa por aquí.
create or replace function public.profiles_nombre_lo_cambia_un_admin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and new.full_name is distinct from old.full_name then
    raise exception 'perfil_nombre_bloqueado: el nombre de una persona lo cambia un admin';
  end if;
  return new;
end;
$$;
revoke all on function public.profiles_nombre_lo_cambia_un_admin() from public, anon, authenticated;

create trigger profiles_nombre_lo_cambia_un_admin
  before update of full_name on public.profiles
  for each row execute function public.profiles_nombre_lo_cambia_un_admin();

-- ════ Funciones (sin candados de tabla) ══════════════════════════════════════

-- ─── A5b: el directo canónico entre yo y otra persona ────────────────────────
-- INVOKER: corre con la RLS de quien pregunta (solo ve sus conversaciones). Si
-- hay más de uno (los viejos, anteriores al candado de A5), gana el del mensaje
-- más reciente; si empatan, el más viejo y después el id. La usan createDirectChat
-- y, en el PR 2, la API.
create or replace function public.chat_directo_con(_otro uuid)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select c.id
    from public.chat_participants yo
    join public.chat_conversations c on c.id = yo.conversation_id and c.type = 'direct'
    join public.chat_participants otro on otro.conversation_id = c.id and otro.user_id = _otro
    left join lateral (
      select m.created_at
        from public.chat_messages m
       where m.conversation_id = c.id
       order by m.created_at desc
       limit 1
    ) ultimo on true
   where yo.user_id = (select auth.uid())
     and _otro is distinct from (select auth.uid())
   order by ultimo.created_at desc nulls last, c.created_at asc, c.id asc
   limit 1
$$;
revoke all on function public.chat_directo_con(uuid) from public, anon;
grant execute on function public.chat_directo_con(uuid) to authenticated, service_role;

-- ─── A11: no leídos con tope ─────────────────────────────────────────────────
-- Corre en cada mensaje ajeno (useUnreadChatCount) y en cada recarga (useChat).
-- La UI pinta «99+» y el contador del menú solo mira > 0: contar más allá de 101
-- era trabajo tirado, y crecía con los no leídos acumulados (62 participaciones
-- con más de 101 en prod el 28/09).
CREATE OR REPLACE FUNCTION public.get_unread_counts(_user_id uuid)
 RETURNS TABLE(conversation_id uuid, unread_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT cp.conversation_id, u.n AS unread_count
  FROM chat_participants cp
  CROSS JOIN LATERAL (
    SELECT count(*) AS n
    FROM (SELECT 1
            FROM chat_messages cm
           WHERE cm.conversation_id = cp.conversation_id
             AND cm.created_at > coalesce(cp.last_read_at, '-infinity'::timestamptz)
             AND cm.sender_id <> _user_id
             AND NOT cm.is_deleted
           LIMIT 101) x
  ) u
  WHERE cp.user_id = _user_id AND _user_id = (SELECT auth.uid());
$function$;

reset lock_timeout;
