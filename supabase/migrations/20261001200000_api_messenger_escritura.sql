-- Messenger por API: la base de la escritura, APAGADA (diseño de la escritura
-- por API, §2, §3, §4.2 y §8 «PR 2»). Lo prueba supabase/tests/api_messenger_escritura.ts
-- sobre el esquema de prod (los dos fixtures, con sus huellas) más las migraciones
-- reales posteriores, la A incluida.
--
-- La pared es la base, no la edge. El edge del PR 4 fabrica un JWT con dos claims de
-- primer nivel: `mvf` (sesión fabricada: siempre) y `mvk` (el id de la API key, si
-- el pedido viene de una). Con eso, aquí:
--   · sin `mvf` ni `mvk` es la app: todo sigue igual (las marcas quedan en NULL);
--   · con `mvk` es una key: la base valida la key en cada escritura (existe, no está
--     revocada ni vencida, es de esa persona, la persona sigue en la agencia, hay UNA
--     sola agencia y la key tiene messenger:read + messenger:write), mira el
--     interruptor y el freno, cobra los cupos y pone la marca «vino por API»;
--   · con `mvf` o `mvk` como claim (aunque sea null) y sin una key en `mvk`, no se
--     escribe nada en chat_* ni en notifications. El cerco usa UN solo predicado
--     (`auth.jwt() ?| array['mvf','mvk']`): un token con `mvk` y sin `mvf` no pasa
--     por «la app» en ninguna parte;
--   · con role=service_role no se inserta en chat_messages, chat_conversations ni
--     chat_participants: un bug de una edge con el cliente admin no se salta ni los
--     cupos ni la marca (hoy nada del repo ni de prod inserta ahí con service_role;
--     revisado el 01/10).
--
-- Qué cambia, en el orden en que va:
--   0   los candados de las 14 tablas, al principio y juntos (ver «Candados»).
--   1   funciones puras: el esqueleto de un nombre y la forma del texto.
--   2   chat_messages.api_key_id / api_display_name (las marcas, SIN FK: la purga de
--       keys no se lleva la marca), su CHECK y dos índices parciales vacíos;
--       chat_message_deletions guarda las marcas; chat_conversations.creada_por_api_key;
--       api_keys.api_display_name + integracion_id (relleno = id: 3 filas);
--       app_flags.valor (para ui_build_minimo, PR 3) y el interruptor
--       app_flags['api_messenger_escritura'] en false.
--   3   api_escritura_cupos (topes ponderados y atómicos) y api_escritura_idem (la
--       idempotencia, fuera de chat_messages: esa fila viaja por Realtime y la leen
--       todos los participantes, y la huella dejaría adivinar un texto borrado).
--   4   el interruptor + el freno por presión (falla cerrado: una señal que no se
--       puede medir cuenta como pasada).
--   5   la key del pedido (api_llave_valida, api_llave_del_pedido).
--   6   los triggers de la pared: chat_messages (insertar y editar),
--       chat_conversations, chat_participants y api_keys (nombre visible, integración,
--       reglas de messenger:write y las filas de cupo).
--   7   el cerco: políticas RESTRICTIVE «mvf o mvk» en toda escritura de chat_* y
--       notifications que no cubre un trigger.
--   8   funciones de prod que cambian: notify_chat_message («BLU (API)»),
--       delete_chat_message (archiva las marcas), get_karma_profile (los mensajes por
--       API no cuentan para la estrella Actividad), delete_conversation_cascade (la
--       sesión fabricada no borra conversaciones) y profiles_nombre_lo_cambia_un_admin
--       (la mitad del esqueleto que A dejó para aquí).
--   9   las RPC: las 4 de escritura (INVOKER: la RLS y los triggers se aplican como en
--       la app), el directorio, api_mi_llave y la retirada de emergencia.
--   10  los permisos: nada nuevo lo ejecuta anon ni PUBLIC.
--   11  la purga diaria de la idempotencia (pg_cron, SQL puro).
--
-- Por qué no cambia nada en la app: los triggers nuevos, para una sesión de la app,
-- solo ponen las marcas en NULL; las políticas del cerco dan true para toda sesión de
-- GoTrue (no trae `mvf` ni `mvk`); las filas que ya están quedan con las marcas en NULL y no se
-- reescriben (columnas nuevas sin default: solo catálogo); ninguna key tiene
-- messenger:write (el alta la cierra el PR 4) y el interruptor está apagado.
--
-- Cómo se compone con la migración A (20260930230000) y el PR 1b (20261001100000),
-- los dos ya en prod. Los triggers BEFORE de una tabla corren en orden alfabético:
--   · chat_messages:     chat_messages_al_insertar (A) → chat_messages_api (B) →
--     trg_mensajes_de_sistema (1b). A pone la fecha, limpia is_edited/is_deleted y
--     rechaza la cita de otra conversación y el archivo de afuera (MV422); B no lo
--     repite: suma la cita borrada, el hilo que no apunta a una raíz y todo lo de la
--     API (por API nunca hay un aviso de sistema, tampoco por chat_evento_sistema).
--   · UPDATE de mensajes: chat_messages_api_editar (B) → trg_guard_chat_message_update
--     (A) → trg_mensajes_de_sistema (1b) → update_chat_messages_updated_at. B copia
--     las marcas de OLD para todos y decide lo de la API; la guarda de A sigue
--     cerrando fecha, tipo, cita, archivo y borrado sin archivo (el GUC
--     maven.borrado_autorizado).
--   · chat_conversations: chat_conversations_agencia (A: agencia, fecha y los topes
--     de 30 grupos y 100 directos por persona en 24 h, MV429) → chat_conversations_api.
--   · chat_participants: chat_participants_agencia (A: agencia, roles, tercero en un
--     directo, directo_duplicado MV409) → chat_participants_api.
--   · api_keys: api_keys_asignar_agencia → api_keys_nombre_visible (B) →
--     api_keys_reglas_messenger → api_keys_validar_actua_como. Por eso B toma la
--     persona con coalesce(acts_as_user_id, created_by).
--
-- Códigos de error (lo que el edge del PR 4 traduce; el `detail` es JSON):
--   MV401 {"error":"unauthorized"}                    key inválida, revocada, vencida o de otra persona
--   MV403 {"error": forbidden | not_allowed_in_conversation | not_your_message |
--          not_an_api_message | other_integration_message}
--   MV404 {"error": not_found | conversation_not_found | person_not_found}
--   MV409 {"error": idempotency_key_reused | message_deleted}
--   MV422 {"error": invalid_text | invalid_reply | conversation_too_large |
--          cannot_message_self | too_many_conversations | invalid_idempotency_key |
--          display_name_* | ...}
--   MV429 {"limite": "<qué tope>", "reintentar_en": <segundos>} → 429 + Retry-After
--   MV503 {"motivo": interruptor | varias_agencias | presion | sin_cupo}
-- Más los de A: MV422 chat_cita_ajena / chat_archivo_externo, MV429 chat_tope_*,
-- MV409 directo_duplicado. 42501 (la RLS: grupo de anuncios sin ser admin) → 403.
--
-- Los cupos (decisión de Jhon del 28/09, con la carga ya bajada por el PR 7): 1.000
-- mensajes por hora por key, por agencia y para la plataforma. Un mensaje pesa
-- (N−1)+3 destinatarios ponderados (un directo, 4): 4.000 por hora es lo que hace
-- entrar los 1.000 directos. Las cifras, y por qué, en la tabla del §3. Se bajan con
-- un UPDATE sobre api_escritura_cupos; los techos (CHECK) solo se suben con una
-- migración.
--
-- Lo verificado en prod en solo lectura el 01/10 (no se creó una rama de Supabase):
--   · ninguna de las 14 tablas tiene FORCE ROW LEVEL SECURITY y todas son de
--     postgres, que además tiene BYPASSRLS: notify_chat_message (DEFINER, de
--     postgres) inserta en notifications sin pasar por el cerco;
--   · postgres (dueño de las funciones del freno) es miembro de pg_read_all_stats y
--     pg_monitor: ve el `state` de los 29 backends de cliente (0 con state NULL);
--   · los slots de Realtime se llaman supabase_realtime_replication_slot_<versión> y
--     supabase_realtime_messages_replication_slot_<versión>: el nombre cambia con la
--     versión de Realtime, así que el freno mira todos los lógicos que empiezan con
--     supabase_realtime (con un nombre fijo, el próximo cambio de versión lo dejaría
--     sin fila = apagado para siempre);
--   · net.http_request_queue existe y postgres la lee (2 filas en ese momento).
--
-- El nombre: el último archivo del repo es 20261001150000_karma_sin_anon y la última
-- versión anotada en prod es 20261001073247 (esa misma, con la hora en que se aplicó).
-- apply_migration anota su propia hora.
--
-- ⚠️ Al aplicarla: el SQL no lleva escapes \u ni caracteres invisibles literales (las
-- clases de caracteres se arman con chr()), así que pasa igual por un transporte que
-- decodifica JSON (el MCP). El banco revisa las dos cosas.
--
-- Candados. Todo va en UNA transacción, y cada ALTER / CREATE INDEX / CREATE TRIGGER
-- / CREATE POLICY toma un candado fuerte que dura hasta el commit (CREATE POLICY pide
-- ACCESS EXCLUSIVE). Por eso el primer bloque los pide TODOS, juntos y antes de tocar
-- nada, en el orden en que los toma un INSERT de mensaje (chat_messages →
-- chat_conversations → chat_participants → notifications), con lock_timeout de 200 ms
-- por candado. Si alguno no llega a tiempo, se sueltan todos (el intento es una
-- subtransacción), se espera 1 s y se reintenta, hasta 8 veces; si no, la migración
-- falla entera sin dejar nada. Lo máximo que una tabla queda trabada por un intento
-- fallido es lo que tardan las esperas que vienen después de ella (como mucho 13 ×
-- 200 ms = 2,6 s para chat_messages). profiles y tenants no se toman fuerte: solo se
-- leen. Con todo tomado, el resto no espera; lo más lento son el VALIDATE del CHECK y
-- los dos índices parciales, que recorren chat_messages una vez cada uno (47.274 filas
-- el 01/10; el banco lo mide). Nada reescribe filas de las tablas del chat.
--
-- ─── VUELTA ATRÁS (el banco la corre tal cual: las líneas «--|») ─────────────
-- Saca lo que podría cambiar el comportamiento de la app: los triggers nuevos de
-- chat_messages, chat_conversations, chat_participants y api_keys, y devuelve
-- notify_chat_message, delete_chat_message, get_karma_profile,
-- delete_conversation_cascade y profiles_nombre_lo_cambia_un_admin a como estaban en
-- prod (después de A). Además apaga el interruptor y les quita a authenticated las 4
-- RPC de escritura: sin los triggers, nada de la API escribe. Si el PR 4 ya está
-- desplegado, antes se apaga el interruptor y se revierte el edge.
-- Quedan, inertes (el banco compara contra prod y exige la lista exacta):
--   · las columnas nuevas (marcas en chat_messages y en el archivo,
--     creada_por_api_key, api_display_name, integracion_id, app_flags.valor) con sus
--     CHECK e índices;
--   · las tablas api_escritura_cupos y api_escritura_idem, y el job de purga;
--   · las políticas del cerco (dan true para toda sesión de la app, y sin ellas una
--     sesión fabricada volvería a escribir en chat_*: no se sacan);
--   · las funciones nuevas sin trigger que las llame, y la fila del interruptor.
-- ⚠️ Después de una vuelta atrás esta misma migración no vuelve a correr (choca con
-- las columnas) y su versión sigue anotada: arreglar hacia adelante exige una
-- migración NUEVA.
--| begin;
--| do $$
--| declare _intento int := 0;
--| begin
--|   perform set_config('lock_timeout', '200ms', true);
--|   loop
--|     _intento := _intento + 1;
--|     begin
--|       lock table public.chat_messages in access exclusive mode;
--|       lock table public.chat_conversations in access exclusive mode;
--|       lock table public.chat_participants in access exclusive mode;
--|       lock table public.api_keys in access exclusive mode;
--|       lock table public.app_flags in row exclusive mode;
--|       exit;
--|     exception when lock_not_available or deadlock_detected then
--|       if _intento >= 8 then
--|         raise exception 'api_candados: no se consiguieron los candados en % intentos; la vuelta atrás no hizo nada, se vuelve a correr más tarde', _intento;
--|       end if;
--|       perform pg_sleep(1);
--|     end;
--|   end loop;
--|   perform set_config('lock_timeout', '3s', true);
--| end $$;
--| update public.app_flags set enabled = false, updated_at = now() where key = 'api_messenger_escritura';
--| revoke execute on function public.api_messenger_enviar(uuid, text, uuid, boolean, text) from authenticated;
--| revoke execute on function public.api_messenger_abrir_directo(uuid, text, text) from authenticated;
--| revoke execute on function public.api_messenger_editar(uuid, uuid, text) from authenticated;
--| revoke execute on function public.api_messenger_borrar(uuid, uuid) from authenticated;
--| drop trigger if exists chat_messages_api on public.chat_messages;
--| drop trigger if exists chat_messages_api_editar on public.chat_messages;
--| drop trigger if exists chat_conversations_api on public.chat_conversations;
--| drop trigger if exists chat_participants_api on public.chat_participants;
--| drop trigger if exists api_keys_nombre_visible on public.api_keys;
--| drop trigger if exists api_keys_cupos_de_escritura on public.api_keys;
--| CREATE OR REPLACE FUNCTION public.notify_chat_message()
--|  RETURNS trigger
--|  LANGUAGE plpgsql
--|  SECURITY DEFINER
--|  SET search_path TO 'public'
--| AS $function$
--| declare
--|   participant record;
--|   sender_name text;
--|   conv_name text;
--|   msg_preview text;
--|   es_mencion boolean;
--| begin
--|   select full_name into sender_name from profiles where id = new.sender_id;
--|   sender_name := coalesce(sender_name, 'Alguien');
--|
--|   select name into conv_name from chat_conversations where id = new.conversation_id;
--|
--|   if new.content is not null and new.content != '' then
--|     msg_preview := left(new.content, 100);
--|   else
--|     msg_preview := '📎 Archivo';
--|   end if;
--|
--|   for participant in
--|     select cp.user_id, p.full_name
--|     from chat_participants cp
--|     left join profiles p on p.id = cp.user_id
--|     where cp.conversation_id = new.conversation_id
--|       and cp.user_id != new.sender_id
--|       and cp.is_muted = false
--|   loop
--|     es_mencion := public.menciona_a(new.content, participant.full_name);
--|     insert into notifications (
--|       user_id, type, title, message, reference_id, reference_type,
--|       module_origin, priority, status, deep_link_url, required_permission_module
--|     ) values (
--|       participant.user_id,
--|       case when es_mencion then 'chat_mention' else 'chat_message' end,
--|       case
--|         when es_mencion and conv_name is not null then sender_name || ' te mencionó en ' || conv_name
--|         when es_mencion then sender_name || ' te mencionó'
--|         when conv_name is not null then sender_name || ' en ' || conv_name
--|         else sender_name
--|       end,
--|       msg_preview,
--|       new.conversation_id,
--|       'conversation',
--|       'messenger',
--|       case when es_mencion then 'high' else 'low' end,
--|       'new',
--|       '/messenger?c=' || new.conversation_id || '&m=' || new.id,
--|       'Messenger'
--|     );
--|   end loop;
--|
--|   return new;
--| end;
--| $function$;
--| CREATE OR REPLACE FUNCTION public.delete_chat_message(p_message_id uuid)
--|  RETURNS jsonb
--|  LANGUAGE plpgsql
--|  SECURITY DEFINER
--|  SET search_path TO 'public'
--| AS $function$
--| declare
--|   v_caller uuid := auth.uid();
--|   m record;
--| begin
--|   if v_caller is null then
--|     return jsonb_build_object('ok', false, 'error', 'not_authenticated');
--|   end if;
--|
--|   select id, conversation_id, sender_id, content, content_rich, type, file_url, file_name, file_size, is_deleted
--|     into m
--|   from chat_messages
--|   where id = p_message_id;
--|
--|   if not found then
--|     return jsonb_build_object('ok', false, 'error', 'not_found');
--|   end if;
--|   if m.is_deleted then
--|     return jsonb_build_object('ok', true, 'already', true);
--|   end if;
--|   if m.sender_id <> v_caller then
--|     return jsonb_build_object('ok', false, 'error', 'not_author');
--|   end if;
--|
--|   insert into chat_message_deletions (
--|     message_id, conversation_id, sender_id, deleted_by,
--|     content, content_rich, type, file_url, file_name, file_size
--|   ) values (
--|     m.id, m.conversation_id, m.sender_id, v_caller,
--|     m.content, m.content_rich, m.type, m.file_url, m.file_name, m.file_size
--|   )
--|   on conflict (message_id) do nothing;
--|
--|   -- El permiso para pasar is_deleted a true vale para ESTE mensaje y se apaga
--|   -- enseguida (local a la transacción; PostgREST no expone set_config).
--|   perform set_config('maven.borrado_autorizado', m.id::text, true);
--|   update chat_messages
--|      set is_deleted = true, content = null, content_rich = null,
--|          file_url = null, file_name = null, file_size = null
--|    where id = m.id;
--|   perform set_config('maven.borrado_autorizado', '', true);
--|
--|   return jsonb_build_object('ok', true);
--| end;
--| $function$;
--| CREATE OR REPLACE FUNCTION public.delete_conversation_cascade(_conversation_id uuid)
--|  RETURNS void
--|  LANGUAGE plpgsql
--|  SECURITY DEFINER
--|  SET search_path TO 'public'
--| AS $function$
--| DECLARE
--|   _msg_ids uuid[];
--| BEGIN
--|   IF NOT EXISTS (
--|     SELECT 1
--|     FROM chat_conversations c
--|     JOIN chat_participants p ON p.conversation_id = c.id AND p.user_id = auth.uid()
--|     WHERE c.id = _conversation_id
--|       AND (c.type = 'direct' OR p.role = 'admin')
--|   ) THEN
--|     RAISE EXCEPTION 'No autorizado para eliminar esta conversación';
--|   END IF;
--|
--|   SELECT array_agg(id) INTO _msg_ids
--|   FROM chat_messages
--|   WHERE conversation_id = _conversation_id;
--|
--|   IF _msg_ids IS NOT NULL AND array_length(_msg_ids, 1) > 0 THEN
--|     DELETE FROM chat_reactions WHERE message_id = ANY(_msg_ids);
--|     DELETE FROM chat_read_receipts WHERE message_id = ANY(_msg_ids);
--|   END IF;
--|
--|   DELETE FROM chat_pinned WHERE conversation_id = _conversation_id;
--|   DELETE FROM chat_archived WHERE conversation_id = _conversation_id;
--|   DELETE FROM chat_space_conversations WHERE conversation_id = _conversation_id;
--|   DELETE FROM chat_messages WHERE conversation_id = _conversation_id;
--|   DELETE FROM chat_participants WHERE conversation_id = _conversation_id;
--|   DELETE FROM notifications WHERE reference_id = _conversation_id AND reference_type = 'conversation';
--|   DELETE FROM chat_conversations WHERE id = _conversation_id;
--| END;
--| $function$;
--| create or replace function public.profiles_nombre_lo_cambia_un_admin()
--| returns trigger
--| language plpgsql
--| set search_path = public
--| as $$
--| begin
--|   if auth.uid() is not null and new.full_name is distinct from old.full_name then
--|     raise exception 'perfil_nombre_bloqueado: el nombre de una persona lo cambia un admin';
--|   end if;
--|   return new;
--| end;
--| $$;
--| CREATE OR REPLACE FUNCTION public.get_karma_profile(target uuid)
--|  RETURNS jsonb
--|  LANGUAGE plpgsql
--|  SECURITY DEFINER
--|  SET search_path TO 'public'
--| AS $function$
--| declare
--|   v_caller   uuid := auth.uid();
--|   v_is_admin boolean;
--|   v_role text; v_role_label text;
--|   v_name text; v_avatar text; v_seed text; v_created timestamptz;
--|   v_email text; v_viewer_can_mail boolean := false;
--|   s_constancia boolean := false;
--|   s_actividad boolean := false;
--|   s_productividad boolean := false;
--|   s_rendimiento boolean := false;
--|   s_companerismo boolean := false;
--|   v_sent int := 0; v_recv int := 0; v_active_days int := 0;
--|   v_hub_act int := null; v_hub_hours numeric := null;
--|   v_givers int := 0; v_eligible int := 0; v_vote_pct int := 0;
--|   v_viewer_sent boolean := false;
--|   v_special boolean := false;
--|   v_stars_count int := 0;
--|   result jsonb;
--| begin
--|   v_is_admin := exists (
--|     select 1 from user_roles ur
--|     join role_groups rg on rg.role_name = ur.role
--|     where ur.user_id = v_caller and rg.is_admin = true
--|   );
--|
--|   select full_name, avatar_url, avatar_seed, created_at
--|     into v_name, v_avatar, v_seed, v_created
--|   from profiles where id = target;
--|   if not found then
--|     return jsonb_build_object('error','not_found');
--|   end if;
--|
--|   select coalesce(
--|     (select c.email_address from mail_credentials c where c.user_id = target and c.revoked_at is null limit 1),
--|     (select u.email from auth.users u where u.id = target)
--|   ) into v_email;
--|
--|   v_viewer_can_mail :=
--|     exists (select 1 from mail_credentials c where c.user_id = v_caller and c.revoked_at is null)
--|     and public.has_permission(v_caller, 'Correo');
--|
--|   select role into v_role from user_roles where user_id = target limit 1;
--|   v_role_label := case v_role
--|     when 'agent' then 'Chatter'
--|     when 'closer' then 'Closer'
--|     when 'manager' then 'Manager'
--|     when 'admin' then 'Admin'
--|     when 'supervisor' then 'Supervisor'
--|     when 'employee' then 'Empleado'
--|     when 'spammer' then 'Warming'
--|     else coalesce(v_role, 'Miembro')
--|   end;
--|
--|   s_constancia := v_created is not null and v_created <= now() - interval '6 months';
--|
--|   select count(*), count(distinct (created_at at time zone 'UTC')::date)
--|     into v_sent, v_active_days
--|   from chat_messages
--|   where sender_id = target and is_deleted = false and type <> 'system'
--|     and created_at >= now() - interval '30 days';
--|   s_actividad := v_sent >= 100 and v_active_days >= 10;
--|
--|   select count(*) into v_recv
--|   from chat_messages m
--|   where m.sender_id <> target and m.is_deleted = false and m.type <> 'system'
--|     and m.created_at >= now() - interval '30 days'
--|     and m.conversation_id in (select conversation_id from chat_participants where user_id = target);
--|
--|   select round(avg(d.overall_activity))::int, round(sum(d.tracked_seconds)/3600.0, 1)
--|     into v_hub_act, v_hub_hours
--|   from hubstaff_daily_data d
--|   join hubstaff_members hm on hm.hubstaff_user_id = d.hubstaff_user_id
--|   where hm.profile_id = target and d.tracked_seconds > 0
--|     and d.date >= current_date - 30;
--|   s_productividad := v_hub_act is not null and v_hub_act >= 65 and coalesce(v_hub_hours,0) >= 40;
--|
--|   select (avg(qc.claude_score) / 10.0) >= 9 into s_rendimiento
--|   from qa_calls qc
--|   join qa_closers qcl on qcl.id = qc.closer_id
--|   where qcl.profile_id = target
--|     and qc.claude_score is not null
--|     and date_trunc('month', qc.call_date) = date_trunc('month', current_date - interval '1 month');
--|   s_rendimiento := coalesce(s_rendimiento, false);
--|
--|   select count(distinct user_id) into v_eligible
--|   from user_roles
--|   where user_id <> target and role not in ('spammer','Warming');
--|
--|   select count(*) into v_givers from karma_sends where recipient_id = target;
--|   v_viewer_sent := exists(select 1 from karma_sends where recipient_id = target and giver_id = v_caller);
--|   if v_eligible > 0 then v_vote_pct := round(100.0 * v_givers / v_eligible); end if;
--|
--|   s_companerismo := v_eligible > 0 and v_givers >= ceil(0.20 * v_eligible);
--|   v_special := v_eligible > 0 and v_givers > 0.70 * v_eligible;
--|
--|   v_stars_count := s_rendimiento::int + s_actividad::int + s_constancia::int
--|                  + s_productividad::int + s_companerismo::int;
--|
--|   result := jsonb_build_object(
--|     'user_id', target, 'name', v_name, 'avatar_url', v_avatar, 'avatar_seed', v_seed,
--|     'role', v_role_label,
--|     'email', v_email, 'viewer_can_mail', v_viewer_can_mail,
--|     'stars', jsonb_build_object(
--|       'rendimiento', s_rendimiento, 'actividad', s_actividad, 'constancia', s_constancia,
--|       'productividad', s_productividad, 'companerismo', s_companerismo
--|     ),
--|     'stars_count', v_stars_count, 'special', v_special, 'vote_pct', v_vote_pct,
--|     'viewer_has_sent', v_viewer_sent, 'is_self', target = v_caller, 'viewer_is_admin', v_is_admin
--|   );
--|
--|   if v_is_admin then
--|     result := result || jsonb_build_object('admin', jsonb_build_object(
--|       'msgs_sent_30d', v_sent, 'msgs_recv_30d', v_recv, 'active_days_30d', v_active_days,
--|       'hub_activity_30d', v_hub_act, 'hub_hours_30d', v_hub_hours,
--|       'karma_givers', v_givers, 'eligible', v_eligible,
--|       'criteria', jsonb_build_object(
--|         'rendimiento',   jsonb_build_object('met', s_rendimiento,   'label','Rendimiento',  'rule','QA mensual >= 9'),
--|         'actividad',     jsonb_build_object('met', s_actividad,     'label','Actividad',    'rule','>= 100 msgs / 30 dias en >= 10 dias'),
--|         'constancia',    jsonb_build_object('met', s_constancia,    'label','Constancia',   'rule','>= 6 meses en el equipo'),
--|         'productividad', jsonb_build_object('met', s_productividad, 'label','Productividad','rule','Hubstaff >= 65% act. y >= 40h'),
--|         'companerismo',  jsonb_build_object('met', s_companerismo,  'label','Companerismo', 'rule','karma de >= 20% del equipo')
--|       )
--|     ));
--|   end if;
--|
--|   return result;
--| end;
--| $function$;
--| commit;
-- ─────────────────────────────────────────────────────────────────────────────

set lock_timeout = '3s';

-- ════ 0. Los candados, todos al principio ════════════════════════════════════
do $$
declare
  _intento int := 0;
begin
  perform set_config('lock_timeout', '200ms', true);
  loop
    _intento := _intento + 1;
    begin
      lock table public.chat_messages in access exclusive mode;            -- marcas, CHECK, índices, triggers, cerco
      lock table public.chat_message_deletions in access exclusive mode;   -- marcas en el archivo
      lock table public.chat_conversations in access exclusive mode;       -- creada_por_api_key, índice, trigger, cerco
      lock table public.chat_participants in access exclusive mode;        -- trigger, cerco
      lock table public.notifications in access exclusive mode;            -- cerco
      lock table public.chat_reactions in access exclusive mode;           -- cerco
      lock table public.chat_read_receipts in access exclusive mode;       -- cerco
      lock table public.chat_pinned in access exclusive mode;              -- cerco
      lock table public.chat_archived in access exclusive mode;            -- cerco
      lock table public.chat_join_requests in access exclusive mode;       -- cerco
      lock table public.chat_spaces in access exclusive mode;              -- cerco
      lock table public.chat_space_conversations in access exclusive mode; -- cerco
      lock table public.api_keys in access exclusive mode;                 -- columnas, relleno, CHECK, triggers
      lock table public.app_flags in access exclusive mode;                -- valor y el interruptor
      exit;
    exception when lock_not_available or deadlock_detected then
      if _intento >= 8 then
        raise exception 'api_candados: no se consiguieron los candados en % intentos; no quedó nada aplicado, se vuelve a correr más tarde', _intento;
      end if;
      perform pg_sleep(1);
    end;
  end loop;
  perform set_config('lock_timeout', '3s', true);
end $$;

-- ════ 1. Funciones puras ═════════════════════════════════════════════════════

-- Sin acentos y en minúsculas. Se escribe con escapes (U&'\00E0'): un carácter
-- acentuado literal en el fuente es igual de válido, pero un byte raro no se ve.
-- Cubre las letras de Latin-1, que son las únicas que admite un nombre visible.
create or replace function public.api_sin_acentos(_t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(translate(
    replace(replace(replace(replace(replace(normalize(coalesce(_t, ''), NFC),
      U&'\00C6', 'AE'), U&'\00E6', 'ae'), U&'\00DF', 'ss'), U&'\00DE', 'TH'), U&'\00FE', 'th'),
    U&'\00C0\00C1\00C2\00C3\00C4\00C5\00C7\00C8\00C9\00CA\00CB\00CC\00CD\00CE\00CF\00D0\00D1\00D2\00D3\00D4\00D5\00D6\00D8\00D9\00DA\00DB\00DC\00DD'
      || U&'\00E0\00E1\00E2\00E3\00E4\00E5\00E7\00E8\00E9\00EA\00EB\00EC\00ED\00EE\00EF\00F0\00F1\00F2\00F3\00F4\00F5\00F6\00F8\00F9\00FA\00FB\00FC\00FD\00FF',
    'AAAAAACEEEEIIIIDNOOOOOOUUUUY' || 'aaaaaaceeeeiiiidnoooooouuuuyy'))
$$;

-- El esqueleto de un nombre, para compararlo sin que lo engañen la tilde, la
-- mayúscula, la puntuación ni los números que imitan letras («Mav3n» = «maven»).
-- Todo lo que no es [a-z0-9] pasa a ser un espacio.
create or replace function public.api_esqueleto(_t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(translate(public.api_sin_acentos(_t), '013457', 'oieast'), '[^a-z0-9]+', ' ', 'g'))
$$;

-- El texto de un mensaje por API: NFC, \r\n → \n y recortado. La forma la decide
-- api_texto_es_valido, sobre el texto ya normalizado.
create or replace function public.api_texto_normalizado(_t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(replace(normalize(_t, NFC), E'\r\n', E'\n'), E' \t\n')
$$;

-- De 1 a 4.000 puntos de código, con al menos un carácter que se vea, y sin la misma
-- clase de invisibles que limpia chat_evento_sistema (PR 1b): controles C0 (salvo
-- salto de línea y tabulador) y C1, el guion blando (U+00AD), los de dirección del
-- texto (U+061C, U+200E, U+200F, U+202A–U+202E, U+2066–U+2069: con ellos un texto se
-- lee distinto de lo que dice), los de ancho cero (U+180E, U+200B, U+200C,
-- U+2060–U+2064, U+FEFF), U+2028/U+2029 y U+206A–U+206F. Se deja U+200D (ZWJ): arma
-- los emojis compuestos. Las clases se arman con chr(<punto de código>): el archivo
-- no lleva ningún carácter invisible literal ni un escape que un transporte pueda
-- decodificar por el camino (el banco revisa las dos cosas).
create or replace function public.api_texto_es_valido(_t text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select _t is not null
     and char_length(_t) between 1 and 4000
     and _t !~ ('[' || chr(1) || '-' || chr(8) || chr(11) || '-' || chr(31) || chr(127) || '-' || chr(159)
                || chr(173) || chr(1564) || chr(6158) || chr(8203) || chr(8204) || chr(8206) || chr(8207)
                || chr(8232) || '-' || chr(8238) || chr(8288) || '-' || chr(8292) || chr(8294) || '-' || chr(8303)
                || chr(65279) || ']')
     -- Al menos un carácter que no sea espacio (tampoco los de Unicode) ni el ZWJ.
     and _t ~ ('[^[:space:]' || chr(160) || chr(5760) || chr(8192) || '-' || chr(8202) || chr(8205)
               || chr(8239) || chr(8287) || chr(12288) || ']')
$$;

-- ════ 2. Columnas ════════════════════════════════════════════════════════════

-- ─── chat_messages: la marca «vino por API» ──────────────────────────────────
-- Sin FK a api_keys: la purga de cuentas borra keys y la marca tiene que quedar.
-- Sin default: solo catálogo, no reescribe filas. Las pone solo un trigger.
alter table public.chat_messages
  add column api_key_id uuid,
  add column api_display_name text;
alter table public.chat_messages add constraint chat_messages_api_coherente check (
  (api_key_id is null) = (api_display_name is null)
  and (api_key_id is null
       or (type = 'text' and file_url is null and file_name is null and file_size is null
           and album_id is null and content_rich is null
           and (is_deleted or coalesce(char_length(content), 0) between 1 and 4000)))
) not valid;
alter table public.chat_messages validate constraint chat_messages_api_coherente;
-- Los dos nacen vacíos (ninguna fila tiene marca). Por conversación: los topes de
-- minuto y día y la ronda. Por key: la retirada de emergencia.
create index chat_messages_api_por_conv on public.chat_messages (conversation_id, created_at) where api_key_id is not null;
create index chat_messages_api_por_llave on public.chat_messages (api_key_id, created_at) where api_key_id is not null;

alter table public.chat_message_deletions
  add column api_key_id uuid,
  add column api_display_name text;

-- ─── chat_conversations: el directo que abrió una key ────────────────────────
alter table public.chat_conversations add column creada_por_api_key uuid;
create index chat_conversations_por_api_key on public.chat_conversations (creada_por_api_key) where creada_por_api_key is not null;

-- ─── api_keys: el nombre visible y la integración ────────────────────────────
-- integracion_id une las keys que se reemplazan una a otra (rotación): editar,
-- borrar y la retirada se deciden por integración, no por key. Las que ya existen
-- son cada una su propia integración (3 filas el 01/10; api_keys no está en
-- Realtime y ningún trigger de UPDATE mira esta columna).
alter table public.api_keys
  add column api_display_name text,
  add column integracion_id uuid;
update public.api_keys set integracion_id = id where integracion_id is null;
alter table public.api_keys
  alter column integracion_id set not null,
  alter column integracion_id set default gen_random_uuid();
alter table public.api_keys add constraint api_keys_escritura_con_lectura
  check (not ('messenger:write' = any (scopes)) or 'messenger:read' = any (scopes)) not valid;
alter table public.api_keys validate constraint api_keys_escritura_con_lectura;
alter table public.api_keys add constraint api_keys_escritura_con_nombre
  check (not ('messenger:write' = any (scopes)) or api_display_name is not null) not valid;
alter table public.api_keys validate constraint api_keys_escritura_con_nombre;
create index api_keys_integracion_idx on public.api_keys (integracion_id);

-- ─── app_flags: el interruptor, apagado ──────────────────────────────────────
-- valor: para 'ui_build_minimo' (PR 3). La fila del interruptor nace en false y,
-- si alguien la hubiera creado antes, también queda en false.
alter table public.app_flags add column valor text;
insert into public.app_flags (key, enabled, note)
values ('api_messenger_escritura', false,
        'Escritura del Messenger por API (PR 2). Apagado: ninguna key escribe, borra ni edita. Se prende a mano en el paso 8 del encendido.')
on conflict (key) do update set enabled = false, note = excluded.note, updated_at = now();

-- ════ 3. Cupos e idempotencia ════════════════════════════════════════════════

-- Una fila por key ('llave:<id>'), por agencia ('agencia:<id>') y la de la
-- plataforma. Cada mensaje gasta 1 mensaje y (N−1)+3 destinatarios ponderados en
-- las tres; un directo nuevo gasta 1 chat; editar o borrar, 1 edición.
--
-- Los valores de arranque (los tres niveles iguales: con una sola key son la misma
-- cuenta; con una segunda, la agencia y la plataforma se reparten):
--   · mensajes: 60/min, 1.000/h (decisión de Jhon), 10.000/día (diez horas al
--     máximo; el orgánico del último mes fue 1.497/día de promedio y 2.444 el pico);
--   · destinatarios ponderados: 300/min (60 directos = 240, o 5 grupos de 50 = 260),
--     4.000/h (los 1.000 directos de la hora × 4) y 40.000/día (10.000 × 4);
--   · chats nuevos: 100/día (la agencia tiene 82 personas; A ya corta en 100
--     directos por persona en 24 h);
--   · ediciones y borrados: 30/min y 300/h.
-- Los techos de los CHECK son el doble y solo se suben con una migración. El piso de
-- destinatarios es 52: un grupo de 50 (el máximo por API) siempre entra en un minuto.
create table public.api_escritura_cupos (
  clave text primary key
    check (clave ~ '^(plataforma|agencia:[0-9a-f-]{36}|llave:[0-9a-f-]{36})$'),
  lim_msj_min   integer not null default 60    check (lim_msj_min   between 1 and 120),
  lim_msj_hora  integer not null default 1000  check (lim_msj_hora  between 1 and 2000),
  lim_msj_dia   integer not null default 10000 check (lim_msj_dia   between 1 and 20000),
  lim_dest_min  integer not null default 300   check (lim_dest_min  between 52 and 600),
  lim_dest_hora integer not null default 4000  check (lim_dest_hora between 52 and 8000),
  lim_dest_dia  integer not null default 40000 check (lim_dest_dia  between 52 and 80000),
  lim_chats_dia integer not null default 100   check (lim_chats_dia between 0 and 100),
  lim_edic_min  integer not null default 30    check (lim_edic_min  between 1 and 60),
  lim_edic_hora integer not null default 300   check (lim_edic_hora between 1 and 1000),
  min_inicio  timestamptz,
  min_msj     integer not null default 0,
  min_dest    integer not null default 0,
  min_edic    integer not null default 0,
  hora_inicio timestamptz,
  hora_msj    integer not null default 0,
  hora_dest   integer not null default 0,
  hora_edic   integer not null default 0,
  dia_inicio  date,
  dia_msj     integer not null default 0,
  dia_dest    integer not null default 0,
  dia_chats   integer not null default 0,
  actualizado timestamptz not null default now(),
  constraint api_escritura_cupos_ventanas check (
    lim_msj_min <= lim_msj_hora and lim_msj_hora <= lim_msj_dia
    and lim_dest_min <= lim_dest_hora and lim_dest_hora <= lim_dest_dia
    and lim_edic_min <= lim_edic_hora)
);
alter table public.api_escritura_cupos enable row level security;
revoke all on table public.api_escritura_cupos from public, anon, authenticated;
comment on table public.api_escritura_cupos is
  'Cupos de la escritura del Messenger por API (PR 2). Sin políticas: la escriben solo las funciones de la base. Para bajar un tope: update api_escritura_cupos set lim_msj_hora = 300 where clave = ''plataforma''.';
-- La plataforma y las agencias de hoy. Las de una key con messenger:write (y su
-- agencia, si es nueva) las crea el trigger de api_keys. Si falta la fila, la
-- escritura falla cerrada (MV503 sin_cupo).
insert into public.api_escritura_cupos (clave) values ('plataforma');
insert into public.api_escritura_cupos (clave) select 'agencia:' || t.id from public.tenants t;

-- La idempotencia: una fila por (key, Idempotency-Key), 72 horas. La huella es el
-- sha256 del pedido; NO va en chat_messages, que viaja por Realtime y leen todos.
create table public.api_escritura_idem (
  api_key_id uuid not null,
  clave_sha bytea not null,
  huella_sha bytea not null,
  conversation_id uuid not null,
  message_id uuid not null,
  conversacion_creada boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (api_key_id, clave_sha)
);
create index api_escritura_idem_por_fecha on public.api_escritura_idem (created_at);
alter table public.api_escritura_idem enable row level security;
revoke all on table public.api_escritura_idem from public, anon, authenticated;
comment on table public.api_escritura_idem is
  'Idempotency-Key de la escritura del Messenger por API, 72 horas. Sin políticas ni Realtime: solo la leen y escriben api_idem_buscar y api_idem_guardar.';

-- ════ 4. El interruptor y el freno ═══════════════════════════════════════════

-- Las tres fuentes del freno, cada una con (valor, medible). Son chicas a propósito:
-- el banco las reemplaza por valores fijos. Una fuente que no se puede ver de verdad
-- da medible = false, y eso frena (falla cerrado).
--   1. Backends de cliente activos. Sin pg_read_all_stats, pg_stat_activity NO da
--      error: devuelve state NULL. Por eso, si algún backend de cliente tiene state
--      NULL, o no se ve ninguno (uno mismo lo es), no es medible.
create or replace function public.api_fuente_backends()
returns table (valor numeric, medible boolean)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  return query
  select count(*) filter (where a.state = 'active')::numeric,
         count(*) > 0 and count(*) filter (where a.state is null) = 0
    from pg_stat_activity a
   where a.backend_type = 'client backend';
exception when others then
  return query select null::numeric, false;
end;
$$;

--   2. Lo que Realtime todavía no leyó del WAL: el máximo de sus slots lógicos. El
--      nombre del slot lleva la versión de Realtime, así que se buscan por prefijo.
--      Sin ninguno, no es medible.
create or replace function public.api_fuente_slot()
returns table (valor numeric, medible boolean)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  return query
  select max(pg_wal_lsn_diff(pg_current_wal_lsn(), s.confirmed_flush_lsn)),
         count(*) > 0 and bool_and(s.confirmed_flush_lsn is not null)
    from pg_replication_slots s
   where s.slot_type = 'logical' and s.slot_name like 'supabase\_realtime%';
exception when others then
  return query select null::numeric, false;
end;
$$;

--   3. La cola de pg_net (la comparten los push del Messenger y los webhooks).
create or replace function public.api_fuente_cola()
returns table (valor numeric, medible boolean)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  return query
  select count(*)::numeric, true
    from (select 1 from net.http_request_queue limit 201) x;
exception when others then
  return query select null::numeric, false;
end;
$$;

-- Los umbrales son constantes: cambiarlos es una migración.
create or replace function public.api_presion_medida()
returns table (senal text, valor numeric, umbral numeric, medible boolean)
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select 'backends_activos'::text, b.valor, 15::numeric, coalesce(b.medible, false) from public.api_fuente_backends() b
  union all
  select 'wal_sin_leer_por_realtime', s.valor, 67108864::numeric, coalesce(s.medible, false) from public.api_fuente_slot() s
  union all
  select 'cola_pg_net', c.valor, 200::numeric, coalesce(c.medible, false) from public.api_fuente_cola() c
$$;

-- El interruptor primero (si está apagado no se mide nada), después que haya UNA sola
-- agencia y después el freno.
create or replace function public.api_escritura_habilitada()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _pasadas jsonb;
begin
  if not coalesce((select f.enabled from public.app_flags f where f.key = 'api_messenger_escritura'), false) then
    raise exception using errcode = 'MV503',
      message = 'api_escritura_apagada: la escritura del Messenger por API está apagada',
      detail = '{"motivo": "interruptor"}';
  end if;
  if (select count(*) from public.tenants) <> 1 then
    raise exception using errcode = 'MV503',
      message = 'api_varias_agencias: con más de una agencia la escritura por API está apagada',
      detail = '{"motivo": "varias_agencias"}';
  end if;
  select jsonb_agg(jsonb_build_object('senal', p.senal, 'valor', p.valor, 'umbral', p.umbral, 'medible', p.medible))
    into _pasadas
    from public.api_presion_medida() p
   where not p.medible or p.valor is null or p.valor > p.umbral;
  if _pasadas is not null then
    raise exception using errcode = 'MV503',
      message = 'api_escritura_en_pausa: la base está bajo presión o no se puede medir',
      detail = jsonb_build_object('motivo', 'presion', 'senales', _pasadas)::text;
  end if;
end;
$$;

-- ─── Los cupos ───────────────────────────────────────────────────────────────
-- Un UPDATE que solo pasa si no se excede ningún tope: atómico entre pedidos (la
-- fila queda tomada hasta el commit). Las ventanas solo avanzan (como
-- api_key_consumir): un pedido que empezó en el minuto anterior cuenta en el nuevo.
-- El día es el de Bogotá. Una dimensión que este pedido no gasta no lo frena.
create or replace function public.api_cupo_gastar(
  _clave text, _msj integer default 0, _dest integer default 0, _chats integer default 0, _edic integer default 0)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _min  timestamptz := date_trunc('minute', now());
  _hora timestamptz := date_trunc('hour', now());
  _dia  date := (now() at time zone 'America/Bogota')::date;
  _c public.api_escritura_cupos;
  _nivel text;
  _limite text;
  _espera integer;
  _fin_dia timestamptz;
begin
  update public.api_escritura_cupos c set
    min_msj   = case when c.min_inicio  >= _min  then c.min_msj   else 0 end + _msj,
    min_dest  = case when c.min_inicio  >= _min  then c.min_dest  else 0 end + _dest,
    min_edic  = case when c.min_inicio  >= _min  then c.min_edic  else 0 end + _edic,
    min_inicio  = greatest(coalesce(c.min_inicio, _min), _min),
    hora_msj  = case when c.hora_inicio >= _hora then c.hora_msj  else 0 end + _msj,
    hora_dest = case when c.hora_inicio >= _hora then c.hora_dest else 0 end + _dest,
    hora_edic = case when c.hora_inicio >= _hora then c.hora_edic else 0 end + _edic,
    hora_inicio = greatest(coalesce(c.hora_inicio, _hora), _hora),
    dia_msj   = case when c.dia_inicio  >= _dia  then c.dia_msj   else 0 end + _msj,
    dia_dest  = case when c.dia_inicio  >= _dia  then c.dia_dest  else 0 end + _dest,
    dia_chats = case when c.dia_inicio  >= _dia  then c.dia_chats else 0 end + _chats,
    dia_inicio  = greatest(coalesce(c.dia_inicio, _dia), _dia),
    actualizado = now()
  where c.clave = _clave
    and (_msj   = 0 or (case when c.min_inicio  >= _min  then c.min_msj   else 0 end) + _msj   <= c.lim_msj_min)
    and (_msj   = 0 or (case when c.hora_inicio >= _hora then c.hora_msj  else 0 end) + _msj   <= c.lim_msj_hora)
    and (_msj   = 0 or (case when c.dia_inicio  >= _dia  then c.dia_msj   else 0 end) + _msj   <= c.lim_msj_dia)
    and (_dest  = 0 or (case when c.min_inicio  >= _min  then c.min_dest  else 0 end) + _dest  <= c.lim_dest_min)
    and (_dest  = 0 or (case when c.hora_inicio >= _hora then c.hora_dest else 0 end) + _dest  <= c.lim_dest_hora)
    and (_dest  = 0 or (case when c.dia_inicio  >= _dia  then c.dia_dest  else 0 end) + _dest  <= c.lim_dest_dia)
    and (_chats = 0 or (case when c.dia_inicio  >= _dia  then c.dia_chats else 0 end) + _chats <= c.lim_chats_dia)
    and (_edic  = 0 or (case when c.min_inicio  >= _min  then c.min_edic  else 0 end) + _edic  <= c.lim_edic_min)
    and (_edic  = 0 or (case when c.hora_inicio >= _hora then c.hora_edic else 0 end) + _edic  <= c.lim_edic_hora);
  if found then
    return;
  end if;

  -- No pasó: o falta la fila (falla cerrado) o se pasa de algún tope (cuál, y cuándo
  -- se libera). Solo corre al rechazar.
  select * into _c from public.api_escritura_cupos c where c.clave = _clave;
  if not found then
    raise exception using errcode = 'MV503',
      message = 'api_sin_cupo: no hay fila de cupo para ' || _clave,
      detail = '{"motivo": "sin_cupo"}';
  end if;
  if _dest > _c.lim_dest_min then
    raise exception using errcode = 'MV422',
      message = 'api_mensaje_demasiado_pesado: un solo mensaje pesa más que el tope por minuto',
      detail = '{"error": "conversation_too_large"}';
  end if;
  _nivel := case when _clave = 'plataforma' then 'platform' when _clave like 'agencia:%' then 'agency' else 'key' end;
  _fin_dia := ((_dia + 1)::timestamp at time zone 'America/Bogota');
  if _msj > 0 and (case when _c.min_inicio >= _min then _c.min_msj else 0 end) + _msj > _c.lim_msj_min then
    _limite := 'messages_minute';   _espera := ceil(extract(epoch from greatest(_c.min_inicio, _min) + interval '1 minute' - now()));
  elsif _msj > 0 and (case when _c.hora_inicio >= _hora then _c.hora_msj else 0 end) + _msj > _c.lim_msj_hora then
    _limite := 'messages_hour';     _espera := ceil(extract(epoch from greatest(_c.hora_inicio, _hora) + interval '1 hour' - now()));
  elsif _msj > 0 and (case when _c.dia_inicio >= _dia then _c.dia_msj else 0 end) + _msj > _c.lim_msj_dia then
    _limite := 'messages_day';      _espera := ceil(extract(epoch from _fin_dia - now()));
  elsif _dest > 0 and (case when _c.min_inicio >= _min then _c.min_dest else 0 end) + _dest > _c.lim_dest_min then
    _limite := 'recipients_minute'; _espera := ceil(extract(epoch from greatest(_c.min_inicio, _min) + interval '1 minute' - now()));
  elsif _dest > 0 and (case when _c.hora_inicio >= _hora then _c.hora_dest else 0 end) + _dest > _c.lim_dest_hora then
    _limite := 'recipients_hour';   _espera := ceil(extract(epoch from greatest(_c.hora_inicio, _hora) + interval '1 hour' - now()));
  elsif _dest > 0 and (case when _c.dia_inicio >= _dia then _c.dia_dest else 0 end) + _dest > _c.lim_dest_dia then
    _limite := 'recipients_day';    _espera := ceil(extract(epoch from _fin_dia - now()));
  elsif _chats > 0 and (case when _c.dia_inicio >= _dia then _c.dia_chats else 0 end) + _chats > _c.lim_chats_dia then
    _limite := 'new_chats_day';     _espera := ceil(extract(epoch from _fin_dia - now()));
  elsif _edic > 0 and (case when _c.min_inicio >= _min then _c.min_edic else 0 end) + _edic > _c.lim_edic_min then
    _limite := 'edits_minute';      _espera := ceil(extract(epoch from greatest(_c.min_inicio, _min) + interval '1 minute' - now()));
  else
    _limite := 'edits_hour';        _espera := ceil(extract(epoch from greatest(_c.hora_inicio, _hora) + interval '1 hour' - now()));
  end if;
  raise exception using errcode = 'MV429',
    message = 'api_tope: se alcanzó el tope ' || _nivel || '_' || _limite,
    detail = json_build_object('limite', _nivel || '_' || _limite, 'reintentar_en', greatest(coalesce(_espera, 1), 1))::text;
end;
$$;

-- ════ 5. La key del pedido ═══════════════════════════════════════════════════

-- El claim `mvk` (primer nivel, nunca user_metadata). Si viene y no es un UUID, el
-- pedido no es de una key válida.
create or replace function public.api_mvk()
returns uuid
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $$
declare
  _v text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'mvk';
begin
  if _v is null then
    return null;
  end if;
  if _v !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception using errcode = 'MV401',
      message = 'api_llave_invalida: el claim mvk no es un id de key',
      detail = '{"error": "unauthorized"}';
  end if;
  return _v::uuid;
end;
$$;

-- La key es válida para este pedido: existe, no está revocada ni vencida, es de quien
-- hace el pedido (cierra la ventana de 60 s del token fabricado), hay UNA sola
-- agencia, la persona sigue vigente en la agencia de la key y la key es de Messenger
-- (con _escritura, además messenger:write). Interna: la llaman las funciones DEFINER.
create or replace function public.api_llave_valida(_id uuid, _escritura boolean)
returns public.api_keys
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  _k public.api_keys;
begin
  select * into _k from public.api_keys k where k.id = _id;
  if not found
     or _k.revoked_at is not null
     or (_k.expires_at is not null and _k.expires_at <= now())
     or _k.acts_as_user_id is distinct from auth.uid() then
    raise exception using errcode = 'MV401',
      message = 'api_llave_invalida: la key del pedido no existe, está revocada, venció o no es de esta persona',
      detail = '{"error": "unauthorized"}';
  end if;
  if (select count(*) from public.tenants) <> 1 then
    raise exception using errcode = 'MV503',
      message = 'api_varias_agencias: con más de una agencia la escritura por API está apagada',
      detail = '{"motivo": "varias_agencias"}';
  end if;
  if not public.api_key_persona_vigente(_k.acts_as_user_id, _k.tenant_id)
     or _k.tenant_id is distinct from public.current_tenant_id() then
    raise exception using errcode = 'MV403',
      message = 'api_persona_no_vigente: la persona de la key ya no está activa en su agencia',
      detail = '{"error": "forbidden"}';
  end if;
  if not ('messenger:read' = any (_k.scopes))
     or (_escritura and not ('messenger:write' = any (_k.scopes))) then
    raise exception using errcode = 'MV403',
      message = 'api_llave_sin_permiso: la key no tiene el permiso de Messenger que hace falta',
      detail = '{"error": "forbidden"}';
  end if;
  return _k;
end;
$$;

-- Lo que las RPC INVOKER necesitan de la key, sin key_hash ni nada más.
create or replace function public.api_llave_del_pedido(_escritura boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  _id uuid := public.api_mvk();
  _k public.api_keys;
begin
  if _id is null then
    raise exception using errcode = 'MV401',
      message = 'api_sin_llave: este pedido no viene de una key',
      detail = '{"error": "unauthorized"}';
  end if;
  _k := public.api_llave_valida(_id, _escritura);
  return jsonb_build_object('id', _k.id, 'tenant_id', _k.tenant_id, 'integracion_id', _k.integracion_id,
                            'display_name', _k.api_display_name);
end;
$$;

-- ¿Se le puede escribir a esta persona? La misma definición de vigente que la
-- lectura (sin baja, sin bloqueo, en la agencia) y además el alta sellada por un
-- admin (admin-user-actions pone app_metadata.alta = 'admin') o una cuenta de antes
-- de esta migración (00:00 de Bogotá del 01/10: las 82 de prod).
create or replace function public.api_persona_alcanzable(_persona uuid, _agencia uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select _persona is not null
     and public.api_key_persona_vigente(_persona, _agencia)
     and exists (select 1 from auth.users u
                  where u.id = _persona
                    and (coalesce(u.raw_app_meta_data ->> 'alta', '') = 'admin'
                         or u.created_at < timestamptz '2026-10-01 05:00:00+00'))
$$;

-- ════ 6. Los triggers de la pared ════════════════════════════════════════════

-- ─── INSERT de mensajes ──────────────────────────────────────────────────────
-- Después de chat_messages_al_insertar (A). La sesión de la app: dos asignaciones.
create or replace function public.chat_messages_api()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _c jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  _id uuid;
  _k public.api_keys;
  _t uuid;
  _cita_borrada boolean;
  _cita_en_hilo boolean;
  _n integer;
  _hay integer;
  _humanos integer;
  _personas integer;
  _desde timestamptz;
  _espera integer;
  _peso integer;
begin
  if _c ->> 'role' = 'service_role' then
    raise exception using errcode = 'MV403',
      message = 'api_service_role_no_escribe_chat: con service_role no se insertan mensajes',
      detail = '{"error": "forbidden"}';
  end if;
  _id := public.api_mvk();
  if _id is null then
    -- La app (y postgres sin claims). Las marcas no las pone el pedido.
    if _c ?| array['mvf', 'mvk'] then
      raise exception using errcode = 'MV403',
        message = 'api_sesion_fabricada_sin_llave: una sesión fabricada sin key no escribe en el chat',
        detail = '{"error": "forbidden"}';
    end if;
    new.api_key_id := null;
    new.api_display_name := null;
    return new;
  end if;

  -- ── La API ──
  _k := public.api_llave_valida(_id, true);
  perform public.api_escritura_habilitada();
  -- Reentrante: la RPC ya lo tiene. Un INSERT directo que llega mientras otro
  -- pedido de la misma key sigue en la base no espera: 429.
  if not pg_try_advisory_xact_lock(hashtextextended('api_escritura:' || _k.id::text, 0)) then
    raise exception using errcode = 'MV429',
      message = 'api_escritura_en_curso: hay otro pedido de esta key en curso',
      detail = '{"limite": "concurrent_write", "reintentar_en": 1}';
  end if;
  if new.sender_id is distinct from auth.uid() then
    raise exception using errcode = 'MV403',
      message = 'api_otro_autor: una key escribe a nombre de su persona',
      detail = '{"error": "forbidden"}';
  end if;
  -- Nunca un aviso de sistema: ni por INSERT directo ni por chat_evento_sistema
  -- (PR 1b, DEFINER), que inserta con la misma sesión y pasa por aquí.
  if new.type = 'system' then
    raise exception using errcode = 'MV403',
      message = 'api_sin_avisos_de_sistema: por API no se mandan avisos de sistema',
      detail = '{"error": "forbidden"}';
  end if;
  -- Solo texto plano (adjuntos, álbumes y texto rico quedan fuera de v1, §9).
  if new.type is distinct from 'text' or new.file_url is not null or new.file_name is not null
     or new.file_size is not null or new.album_id is not null or new.content_rich is not null then
    raise exception using errcode = 'MV422',
      message = 'api_solo_texto: por API solo se manda texto plano',
      detail = '{"error": "invalid_text"}';
  end if;
  new.content := public.api_texto_normalizado(new.content);
  if not public.api_texto_es_valido(new.content) then
    raise exception using errcode = 'MV422',
      message = 'api_texto_invalido: el texto tiene que tener de 1 a 4.000 caracteres, sin caracteres de control ni de dirección',
      detail = '{"error": "invalid_text"}';
  end if;
  new.is_edited := false;
  new.is_deleted := false;
  new.created_at := now();

  -- La conversación es de la agencia de la key (que sea participante lo decide la RLS).
  select c.tenant_id into _t from public.chat_conversations c where c.id = new.conversation_id;
  if not found or _t is distinct from _k.tenant_id then
    raise exception using errcode = 'MV404',
      message = 'api_conversacion_no_encontrada: esa conversación no existe para esta key',
      detail = '{"error": "conversation_not_found"}';
  end if;
  -- La cita: que sea de la misma conversación ya lo exige A (MV422 chat_cita_ajena).
  -- Aquí: que no esté borrada y que un hilo apunte a una raíz.
  if new.is_thread_reply and new.reply_to_id is null then
    raise exception using errcode = 'MV422',
      message = 'api_cita_invalida: una respuesta en hilo tiene que apuntar a un mensaje',
      detail = '{"error": "invalid_reply"}';
  end if;
  if new.reply_to_id is not null then
    select m.is_deleted, m.is_thread_reply into _cita_borrada, _cita_en_hilo
      from public.chat_messages m
     where m.id = new.reply_to_id and m.conversation_id = new.conversation_id;
    if not found or _cita_borrada or (new.is_thread_reply and _cita_en_hilo) then
      raise exception using errcode = 'MV422',
        message = 'api_cita_invalida: la cita no existe, está borrada o el hilo no apunta a una raíz',
        detail = '{"error": "invalid_reply"}';
    end if;
  end if;
  -- Tamaño: como mucho 50 personas.
  select count(*) into _n from (select 1 from public.chat_participants p where p.conversation_id = new.conversation_id limit 51) x;
  if _n > 50 then
    raise exception using errcode = 'MV422',
      message = 'api_conversacion_muy_grande: por API se escribe en conversaciones de hasta 50 personas',
      detail = '{"error": "conversation_too_large"}';
  end if;

  -- Por conversación, entre TODAS las keys: uno a la vez (espera como mucho el
  -- lock_timeout de la RPC), 6 por minuto, 150 por día de Bogotá y el corte de ronda.
  perform pg_advisory_xact_lock(hashtextextended('api_conv:' || new.conversation_id::text, 0));
  select count(*), min(u.created_at) into _hay, _desde
    from (select m.created_at from public.chat_messages m
           where m.conversation_id = new.conversation_id and m.api_key_id is not null
             and m.created_at > now() - interval '1 minute'
           order by m.created_at limit 6) u;
  if _hay >= 6 then
    _espera := greatest(ceil(extract(epoch from _desde + interval '1 minute' - now()))::integer, 1);
    raise exception using errcode = 'MV429',
      message = 'api_tope: se alcanzó el tope conversation_minute',
      detail = json_build_object('limite', 'conversation_minute', 'reintentar_en', _espera)::text;
  end if;
  _desde := (date_trunc('day', now() at time zone 'America/Bogota')) at time zone 'America/Bogota';
  select count(*) into _hay
    from (select 1 from public.chat_messages m
           where m.conversation_id = new.conversation_id and m.api_key_id is not null
             and m.created_at >= _desde
           limit 150) u;
  if _hay >= 150 then
    _espera := greatest(ceil(extract(epoch from _desde + interval '1 day' - now()))::integer, 1);
    raise exception using errcode = 'MV429',
      message = 'api_tope: se alcanzó el tope conversation_day',
      detail = json_build_object('limite', 'conversation_day', 'reintentar_en', _espera)::text;
  end if;
  -- La ronda entre integraciones: si los últimos 20 mensajes de la conversación son
  -- TODOS por API y de 2 personas o más, nadie humano está mirando. Se mide por
  -- persona, no por key: dos integraciones de la misma persona no se despiertan
  -- entre sí (exclude_own de los webhooks saca a la persona), y una sola integración
  -- que publica sola no se corta (la frenan conversation_day y los topes del día).
  select count(*), count(*) filter (where u.api_key_id is null), count(distinct u.sender_id)
    into _hay, _humanos, _personas
    from (select m.api_key_id, m.sender_id from public.chat_messages m
           where m.conversation_id = new.conversation_id
           order by m.created_at desc limit 20) u;
  if _hay = 20 and _humanos = 0 and _personas >= 2 then
    raise exception using errcode = 'MV429',
      message = 'api_ronda: los últimos 20 mensajes son de integraciones; hace falta que escriba una persona',
      detail = '{"limite": "conversation_loop", "reintentar_en": 3600}';
  end if;

  -- El costo: (N−1) destinatarios + 3 fijos (las escuchas de Realtime sin filtro).
  _peso := (_n - 1) + 3;
  perform public.api_cupo_gastar('llave:' || _k.id::text, _msj => 1, _dest => _peso);
  perform public.api_cupo_gastar('agencia:' || _k.tenant_id::text, _msj => 1, _dest => _peso);
  perform public.api_cupo_gastar('plataforma', _msj => 1, _dest => _peso);

  new.api_key_id := _k.id;
  new.api_display_name := _k.api_display_name;
  return new;
end;
$$;

create trigger chat_messages_api
  before insert on public.chat_messages
  for each row execute function public.chat_messages_api();

-- ─── UPDATE de mensajes ──────────────────────────────────────────────────────
-- Antes de la guarda de A. Las marcas no cambian nunca, lo haga quien lo haga.
create or replace function public.chat_messages_api_editar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _c jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  _id uuid;
  _k public.api_keys;
  _borrado boolean;
begin
  new.api_key_id := old.api_key_id;
  new.api_display_name := old.api_display_name;
  _borrado := not old.is_deleted and new.is_deleted
              and current_setting('maven.borrado_autorizado', true) is not distinct from old.id::text;
  _id := public.api_mvk();
  if _id is null then
    if _c ?| array['mvf', 'mvk'] then
      raise exception using errcode = 'MV403',
        message = 'api_sesion_fabricada_sin_llave: una sesión fabricada sin key no escribe en el chat',
        detail = '{"error": "forbidden"}';
    end if;
    -- La app borra los mensajes por API de su persona (delete_chat_message), pero no
    -- los edita: quedaría bajo el nombre de la integración algo que ella no escribió.
    if old.api_key_id is not null and auth.uid() is not null and not _borrado
       and (new.content is distinct from old.content or new.content_rich is distinct from old.content_rich) then
      raise exception using errcode = 'MV403',
        message = 'api_mensaje_de_integracion: un mensaje que mandó una integración no se edita desde la app',
        detail = '{"error": "forbidden"}';
    end if;
    return new;
  end if;

  -- ── La API: solo lo que mandó la MISMA integración, también al borrar ──
  _k := public.api_llave_valida(_id, true);
  perform public.api_escritura_habilitada();
  if not pg_try_advisory_xact_lock(hashtextextended('api_escritura:' || _k.id::text, 0)) then
    raise exception using errcode = 'MV429',
      message = 'api_escritura_en_curso: hay otro pedido de esta key en curso',
      detail = '{"limite": "concurrent_write", "reintentar_en": 1}';
  end if;
  if old.sender_id is distinct from auth.uid() then
    raise exception using errcode = 'MV403',
      message = 'api_no_es_tuyo: ese mensaje es de otra persona',
      detail = '{"error": "not_your_message"}';
  end if;
  if old.api_key_id is null then
    raise exception using errcode = 'MV403',
      message = 'api_mensaje_escrito_a_mano: ese mensaje no lo mandó una integración',
      detail = '{"error": "not_an_api_message"}';
  end if;
  if not exists (select 1 from public.api_keys k where k.id = old.api_key_id and k.integracion_id = _k.integracion_id) then
    raise exception using errcode = 'MV403',
      message = 'api_otra_integracion: ese mensaje lo mandó otra integración',
      detail = '{"error": "other_integration_message"}';
  end if;
  if old.is_deleted then
    raise exception using errcode = 'MV409',
      message = 'api_mensaje_borrado: ese mensaje ya está borrado',
      detail = '{"error": "message_deleted"}';
  end if;
  if not _borrado then
    new.content := public.api_texto_normalizado(new.content);
    if not public.api_texto_es_valido(new.content) then
      raise exception using errcode = 'MV422',
        message = 'api_texto_invalido: el texto tiene que tener de 1 a 4.000 caracteres, sin caracteres de control ni de dirección',
        detail = '{"error": "invalid_text"}';
    end if;
    new.content_rich := null;
  end if;
  perform public.api_cupo_gastar('llave:' || _k.id::text, _edic => 1);
  perform public.api_cupo_gastar('agencia:' || _k.tenant_id::text, _edic => 1);
  perform public.api_cupo_gastar('plataforma', _edic => 1);
  return new;
end;
$$;

create trigger chat_messages_api_editar
  before update on public.chat_messages
  for each row execute function public.chat_messages_api_editar();

-- ─── Conversaciones ──────────────────────────────────────────────────────────
-- Después de chat_conversations_agencia (A). Por API solo se abre un directo propio,
-- y solo dentro de api_messenger_abrir_directo (con el primer mensaje).
create or replace function public.chat_conversations_api()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _c jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  _id uuid;
  _k public.api_keys;
  _n integer;
begin
  if tg_op = 'UPDATE' then
    if new.creada_por_api_key is distinct from old.creada_por_api_key then
      raise exception 'chat_conversacion_inmutable: la key que abrió una conversación no cambia';
    end if;
    return new;
  end if;
  if _c ->> 'role' = 'service_role' then
    raise exception using errcode = 'MV403',
      message = 'api_service_role_no_escribe_chat: con service_role no se crean conversaciones',
      detail = '{"error": "forbidden"}';
  end if;
  _id := public.api_mvk();
  if _id is null then
    if _c ?| array['mvf', 'mvk'] then
      raise exception using errcode = 'MV403',
        message = 'api_sesion_fabricada_sin_llave: una sesión fabricada sin key no escribe en el chat',
        detail = '{"error": "forbidden"}';
    end if;
    new.creada_por_api_key := null;
    return new;
  end if;

  _k := public.api_llave_valida(_id, true);
  perform public.api_escritura_habilitada();
  if not pg_try_advisory_xact_lock(hashtextextended('api_escritura:' || _k.id::text, 0)) then
    raise exception using errcode = 'MV429',
      message = 'api_escritura_en_curso: hay otro pedido de esta key en curso',
      detail = '{"limite": "concurrent_write", "reintentar_en": 1}';
  end if;
  if new.type is distinct from 'direct' or new.created_by is distinct from auth.uid() then
    raise exception using errcode = 'MV403',
      message = 'api_solo_directos: por API solo se abre un chat directo propio',
      detail = '{"error": "forbidden"}';
  end if;
  -- Margen contra el tope de lectura (500 conversaciones por persona) y contra las
  -- que abren sus propias keys.
  select count(*) into _n from (select 1 from public.chat_participants p where p.user_id = auth.uid() limit 450) x;
  if _n >= 450 then
    raise exception using errcode = 'MV422',
      message = 'api_demasiadas_conversaciones: la persona de la key ya está en 450 conversaciones',
      detail = '{"error": "too_many_conversations"}';
  end if;
  select count(*) into _n
    from (select 1 from public.chat_conversations c
            join public.api_keys k on k.id = c.creada_por_api_key
           where k.acts_as_user_id = auth.uid()
           limit 200) x;
  if _n >= 200 then
    raise exception using errcode = 'MV422',
      message = 'api_demasiadas_conversaciones: las keys de esta persona ya abrieron 200 conversaciones',
      detail = '{"error": "too_many_conversations"}';
  end if;
  perform public.api_cupo_gastar('llave:' || _k.id::text, _chats => 1);
  perform public.api_cupo_gastar('agencia:' || _k.tenant_id::text, _chats => 1);
  perform public.api_cupo_gastar('plataforma', _chats => 1);
  new.creada_por_api_key := _k.id;
  new.created_at := now();
  return new;
end;
$$;

create trigger chat_conversations_api
  before insert or update of creada_por_api_key on public.chat_conversations
  for each row execute function public.chat_conversations_api();

-- ─── Participantes ───────────────────────────────────────────────────────────
-- Después de chat_participants_agencia (A). Por API solo se suma gente al directo
-- que esa misma key acaba de abrir en esta transacción, y solo a alguien alcanzable.
create or replace function public.chat_participants_api()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _c jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  _id uuid;
  _k public.api_keys;
  _abrio uuid;
  _abierta timestamptz;
begin
  if _c ->> 'role' = 'service_role' then
    raise exception using errcode = 'MV403',
      message = 'api_service_role_no_escribe_chat: con service_role no se suman participantes',
      detail = '{"error": "forbidden"}';
  end if;
  _id := public.api_mvk();
  if _id is null then
    if _c ?| array['mvf', 'mvk'] then
      raise exception using errcode = 'MV403',
        message = 'api_sesion_fabricada_sin_llave: una sesión fabricada sin key no escribe en el chat',
        detail = '{"error": "forbidden"}';
    end if;
    return new;
  end if;

  _k := public.api_llave_valida(_id, true);
  perform public.api_escritura_habilitada();
  if not pg_try_advisory_xact_lock(hashtextextended('api_escritura:' || _k.id::text, 0)) then
    raise exception using errcode = 'MV429',
      message = 'api_escritura_en_curso: hay otro pedido de esta key en curso',
      detail = '{"limite": "concurrent_write", "reintentar_en": 1}';
  end if;
  select c.creada_por_api_key, c.created_at into _abrio, _abierta from public.chat_conversations c where c.id = new.conversation_id;
  if not found or _abrio is distinct from _k.id or _abierta is distinct from now() then
    raise exception using errcode = 'MV403',
      message = 'api_no_suma_participantes: por API solo se suma gente al directo que se abre en el mismo pedido',
      detail = '{"error": "forbidden"}';
  end if;
  if new.user_id is distinct from auth.uid() and not public.api_persona_alcanzable(new.user_id, _k.tenant_id) then
    raise exception using errcode = 'MV404',
      message = 'api_persona_no_encontrada: a esa persona no se le puede escribir por API',
      detail = '{"error": "person_not_found"}';
  end if;
  return new;
end;
$$;

create trigger chat_participants_api
  before insert on public.chat_participants
  for each row execute function public.chat_participants_api();

-- ─── api_keys: nombre visible, integración y messenger:write ─────────────────
-- Después de api_keys_asignar_agencia (tenant_id ya está) y antes de
-- api_keys_validar_actua_como (por eso la persona es coalesce(acts_as_user_id,
-- created_by)). Solo OF estas columnas: api_key_consumir hace UPDATE en cada pedido
-- y no pasa por aquí. Rechaza con MV422 y un código que manage-api-keys traduce.
create or replace function public.api_keys_nombre_visible()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _persona uuid := coalesce(new.acts_as_user_id, new.created_by);
  _escribe boolean := 'messenger:write' = any (new.scopes);
  _esq text;
  _sin text;
  _p record;
  _pila text;
  _completo text;
begin
  if tg_op = 'UPDATE' and new.integracion_id is distinct from old.integracion_id then
    raise exception using errcode = 'MV422',
      message = 'api_integracion_inmutable: la integración de una key no cambia',
      detail = '{"error": "integration_immutable"}';
  end if;
  if new.integracion_id is null then
    new.integracion_id := gen_random_uuid();
  end if;
  -- Una integración es de UNA persona y UNA agencia (la rotación copia el id).
  if tg_op = 'INSERT' and exists (
       select 1 from public.api_keys k
        where k.integracion_id = new.integracion_id
          and (k.acts_as_user_id is distinct from _persona or k.tenant_id is distinct from new.tenant_id)) then
    raise exception using errcode = 'MV422',
      message = 'api_integracion_ajena: esa integración es de otra persona o de otra agencia',
      detail = '{"error": "integration_not_yours"}';
  end if;
  if _escribe and not ('messenger:read' = any (new.scopes)) then
    raise exception using errcode = 'MV422',
      message = 'api_escritura_sin_lectura: messenger:write va con messenger:read',
      detail = '{"error": "messenger_write_without_read"}';
  end if;
  if tg_op = 'UPDATE' and _escribe and not ('messenger:write' = any (old.scopes)) then
    raise exception using errcode = 'MV422',
      message = 'api_escritura_solo_al_crear: messenger:write solo se pone al crear una key nueva',
      detail = '{"error": "messenger_write_only_new_keys"}';
  end if;
  if _escribe and new.api_display_name is null then
    raise exception using errcode = 'MV422',
      message = 'api_nombre_visible_requerido: una key que escribe necesita nombre visible',
      detail = '{"error": "display_name_required"}';
  end if;
  if new.api_display_name is null
     or (tg_op = 'UPDATE' and new.api_display_name is not distinct from old.api_display_name) then
    return new;
  end if;

  -- 1. Forma: NFC, recortado, espacios juntos; de 2 a 32, solo letras de Latin-1
  --    (U+00C0–U+00FF sin × ni ÷, armadas con chr()), números, espacio y . & _ -.
  new.api_display_name := regexp_replace(btrim(normalize(new.api_display_name, NFC)), ' {2,}', ' ', 'g');
  _esq := public.api_esqueleto(new.api_display_name);
  _sin := replace(_esq, ' ', '');
  if char_length(new.api_display_name) not between 2 and 32
     or new.api_display_name !~ ('^[A-Za-z0-9' || chr(192) || '-' || chr(214) || chr(216) || '-' || chr(246)
                                  || chr(248) || '-' || chr(255) || ' .&_-]+$')
     or char_length(_sin) < 2 then
    raise exception using errcode = 'MV422',
      message = 'api_nombre_visible_forma: de 2 a 32 caracteres, con letras, números, espacio y . & _ -',
      detail = '{"error": "display_name_format"}';
  end if;
  -- 2. Raíces reservadas, como subcadena del esqueleto sin espacios.
  if _sin ~ '(maven|admin|soporte|support|sistem|system|segur|secur|rrhh|recursoshumanos|talentohumano|nomina|payroll|finanz|contab|tesorer|helpdesk|ayuda|oficial|staff|moderad|ceo|gerenc|direcc|notific|clari|anthropic|claude)' then
    raise exception using errcode = 'MV422',
      message = 'api_nombre_visible_reservado: el nombre se parece a uno de Maven o de un área',
      detail = '{"error": "display_name_reserved"}';
  end if;
  -- 3. Personas de la agencia: ni su nombre completo como subcadena, ni un nombre de
  --    pila de 3 letras o más como palabra, ni ser igual a un nombre de pila.
  for _p in
    select pr.full_name
      from public.tenant_members tm
      join public.profiles pr on pr.id = tm.user_id
     where tm.tenant_id = new.tenant_id and pr.full_name is not null
  loop
    _completo := replace(public.api_esqueleto(_p.full_name), ' ', '');
    _pila := split_part(public.api_esqueleto(_p.full_name), ' ', 1);
    if (char_length(_completo) >= 3 and position(_completo in _sin) > 0)
       or (char_length(_pila) >= 3 and _pila = any (string_to_array(_esq, ' ')))
       or (_pila <> '' and _sin = _pila) then
      raise exception using errcode = 'MV422',
        message = 'api_nombre_visible_persona: el nombre se parece al de una persona de la agencia',
        detail = '{"error": "display_name_person"}';
    end if;
  end loop;
  -- 4. Reservado para siempre por integración: ninguna key de la agencia de OTRA
  --    integración con el mismo esqueleto, viva, vencida o revocada.
  if exists (select 1 from public.api_keys k
              where k.tenant_id = new.tenant_id
                and k.integracion_id is distinct from new.integracion_id
                and k.api_display_name is not null
                and replace(public.api_esqueleto(k.api_display_name), ' ', '') = _sin) then
    raise exception using errcode = 'MV422',
      message = 'api_nombre_visible_ocupado: otra integración de la agencia ya usó ese nombre',
      detail = '{"error": "display_name_taken"}';
  end if;
  return new;
end;
$$;

create trigger api_keys_nombre_visible
  before insert or update of api_display_name, scopes, integracion_id on public.api_keys
  for each row execute function public.api_keys_nombre_visible();

-- Cuando una key tiene messenger:write, su fila de cupo (y la de su agencia, si no
-- estaba). Si falta, la escritura falla cerrada.
create or replace function public.api_keys_cupos_de_escritura()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if 'messenger:write' = any (new.scopes) then
    insert into public.api_escritura_cupos (clave)
    values ('llave:' || new.id::text), ('agencia:' || new.tenant_id::text)
    on conflict (clave) do nothing;
  end if;
  return null;
end;
$$;

create trigger api_keys_cupos_de_escritura
  after insert or update of scopes on public.api_keys
  for each row execute function public.api_keys_cupos_de_escritura();

-- ════ 7. El cerco de la sesión fabricada ═════════════════════════════════════
-- RESTRICTIVE y por comando (nunca FOR ALL: la bandeja de la API LEE chat_pinned y
-- chat_archived). El (select …) corre una vez por sentencia (initplan). Un solo
-- predicado, el mismo de las guardas DEFINER y de los triggers: es fabricada la sesión
-- que trae `mvf` o `mvk` como claim de primer nivel, aunque sea con valor null (un
-- token con `mvk` y sin `mvf` también queda afuera). Para una sesión de GoTrue, que
-- no trae ninguno de los dos, da true; sin claims (postgres), también. Lo que no está aquí lo cierra un trigger:
-- INSERT de chat_conversations y chat_participants, INSERT y UPDATE de chat_messages.
-- chat_message_deletions no tiene políticas de escritura (nadie escribe ahí con sesión).
-- Las funciones DEFINER que escriben en el chat no pasan por estas políticas: o tienen
-- su propia guarda con el mismo predicado (delete_conversation_cascade, la retirada) o su única
-- escritura cae en un trigger de la pared (delete_chat_message → UPDATE de
-- chat_messages; chat_evento_sistema, del PR 1b → INSERT de chat_messages, donde una
-- sesión fabricada da MV403 y una key también: por API no hay avisos de sistema). El
-- banco lo revisa en el catálogo, sea cual sea el orden en que se apliquen 1b y B.
create policy api_fabricada_no_borra on public.chat_messages as restrictive for delete to public
  using ((select auth.jwt() ?| array['mvf', 'mvk']) is not true);

create policy api_fabricada_no_cambia on public.chat_conversations as restrictive for update to public
  using ((select auth.jwt() ?| array['mvf', 'mvk']) is not true) with check ((select auth.jwt() ?| array['mvf', 'mvk']) is not true);
create policy api_fabricada_no_borra on public.chat_conversations as restrictive for delete to public
  using ((select auth.jwt() ?| array['mvf', 'mvk']) is not true);

create policy api_fabricada_no_cambia on public.chat_participants as restrictive for update to public
  using ((select auth.jwt() ?| array['mvf', 'mvk']) is not true) with check ((select auth.jwt() ?| array['mvf', 'mvk']) is not true);
create policy api_fabricada_no_borra on public.chat_participants as restrictive for delete to public
  using ((select auth.jwt() ?| array['mvf', 'mvk']) is not true);

do $$
declare
  _t text;
  _pred text := $p$(select auth.jwt() ?| array['mvf', 'mvk']) is not true$p$;
begin
  foreach _t in array array['notifications', 'chat_reactions', 'chat_read_receipts', 'chat_pinned', 'chat_archived',
                            'chat_join_requests', 'chat_spaces', 'chat_space_conversations'] loop
    execute format('create policy api_fabricada_no_inserta on public.%I as restrictive for insert to public with check (%s)', _t, _pred);
    execute format('create policy api_fabricada_no_cambia on public.%I as restrictive for update to public using (%s) with check (%s)', _t, _pred, _pred);
    execute format('create policy api_fabricada_no_borra on public.%I as restrictive for delete to public using (%s)', _t, _pred);
  end loop;
end $$;

-- ════ 8. Funciones de prod que cambian ═══════════════════════════════════════

-- ─── notify_chat_message: «BLU (API)» ────────────────────────────────────────
-- El cuerpo de prod (huella 1639124f… el 01/10), cambiando solo de dónde sale el
-- nombre: un mensaje por API se anuncia con el nombre visible de la key y la etiqueta
-- (API), en la campana y en el título. Lo persistido no se traduce.
CREATE OR REPLACE FUNCTION public.notify_chat_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  participant record;
  sender_name text;
  conv_name text;
  msg_preview text;
  es_mencion boolean;
begin
  if new.api_key_id is not null then
    sender_name := new.api_display_name || ' (API)';
  else
    select full_name into sender_name from profiles where id = new.sender_id;
    sender_name := coalesce(sender_name, 'Alguien');
  end if;

  select name into conv_name from chat_conversations where id = new.conversation_id;

  if new.content is not null and new.content != '' then
    msg_preview := left(new.content, 100);
  else
    msg_preview := '📎 Archivo';
  end if;

  for participant in
    select cp.user_id, p.full_name
    from chat_participants cp
    left join profiles p on p.id = cp.user_id
    where cp.conversation_id = new.conversation_id
      and cp.user_id != new.sender_id
      and cp.is_muted = false
  loop
    es_mencion := public.menciona_a(new.content, participant.full_name);
    insert into notifications (
      user_id, type, title, message, reference_id, reference_type,
      module_origin, priority, status, deep_link_url, required_permission_module
    ) values (
      participant.user_id,
      case when es_mencion then 'chat_mention' else 'chat_message' end,
      case
        when es_mencion and conv_name is not null then sender_name || ' te mencionó en ' || conv_name
        when es_mencion then sender_name || ' te mencionó'
        when conv_name is not null then sender_name || ' en ' || conv_name
        else sender_name
      end,
      msg_preview,
      new.conversation_id,
      'conversation',
      'messenger',
      case when es_mencion then 'high' else 'low' end,
      'new',
      '/messenger?c=' || new.conversation_id || '&m=' || new.id,
      'Messenger'
    );
  end loop;

  return new;
end;
$function$;

-- ─── delete_chat_message: el archivo guarda también las marcas ───────────────
-- La versión de A (huella e1a4cceb… en prod el 01/10) + api_key_id y api_display_name.
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

  select id, conversation_id, sender_id, content, content_rich, type, file_url, file_name, file_size, is_deleted,
         api_key_id, api_display_name
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
    content, content_rich, type, file_url, file_name, file_size,
    api_key_id, api_display_name
  ) values (
    m.id, m.conversation_id, m.sender_id, v_caller,
    m.content, m.content_rich, m.type, m.file_url, m.file_name, m.file_size,
    m.api_key_id, m.api_display_name
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

-- ─── delete_conversation_cascade: la sesión fabricada no borra ───────────────
-- El cuerpo de prod (huella 1f2ecf75…) con una guarda al principio: es DEFINER y no
-- pasa por el cerco.
CREATE OR REPLACE FUNCTION public.delete_conversation_cascade(_conversation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _msg_ids uuid[];
BEGIN
  IF (auth.jwt() ?| array['mvf', 'mvk']) IS TRUE THEN
    RAISE EXCEPTION USING ERRCODE = 'MV403',
      MESSAGE = 'api_sesion_fabricada_no_borra: una sesión fabricada no borra conversaciones',
      DETAIL = '{"error": "forbidden"}';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM chat_conversations c
    JOIN chat_participants p ON p.conversation_id = c.id AND p.user_id = auth.uid()
    WHERE c.id = _conversation_id
      AND (c.type = 'direct' OR p.role = 'admin')
  ) THEN
    RAISE EXCEPTION 'No autorizado para eliminar esta conversación';
  END IF;

  SELECT array_agg(id) INTO _msg_ids
  FROM chat_messages
  WHERE conversation_id = _conversation_id;

  IF _msg_ids IS NOT NULL AND array_length(_msg_ids, 1) > 0 THEN
    DELETE FROM chat_reactions WHERE message_id = ANY(_msg_ids);
    DELETE FROM chat_read_receipts WHERE message_id = ANY(_msg_ids);
  END IF;

  DELETE FROM chat_pinned WHERE conversation_id = _conversation_id;
  DELETE FROM chat_archived WHERE conversation_id = _conversation_id;
  DELETE FROM chat_space_conversations WHERE conversation_id = _conversation_id;
  DELETE FROM chat_messages WHERE conversation_id = _conversation_id;
  DELETE FROM chat_participants WHERE conversation_id = _conversation_id;
  DELETE FROM notifications WHERE reference_id = _conversation_id AND reference_type = 'conversation';
  DELETE FROM chat_conversations WHERE id = _conversation_id;
END;
$function$;

-- ─── profiles: nadie se llama como una integración ───────────────────────────
-- La mitad de A10 que A dejó para aquí (la columna nace en esta migración): para
-- todos, también para el admin con service_role, un full_name cuyo esqueleto es el
-- de un nombre visible de su agencia se rechaza. Sigue sin tocar el INSERT de
-- handle_new_user (solo UPDATE OF full_name).
create or replace function public.api_nombre_de_integracion(_persona uuid, _nombre text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select char_length(replace(public.api_esqueleto(_nombre), ' ', '')) >= 2
     and exists (select 1
                   from public.api_keys k
                   join public.tenant_members tm on tm.tenant_id = k.tenant_id and tm.user_id = _persona
                  where k.api_display_name is not null
                    and replace(public.api_esqueleto(k.api_display_name), ' ', '') = replace(public.api_esqueleto(_nombre), ' ', ''))
$$;

create or replace function public.profiles_nombre_lo_cambia_un_admin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and new.full_name is distinct from old.full_name then
    raise exception 'perfil_nombre_bloqueado: el nombre de una persona lo cambia un admin';
  end if;
  -- IF anidado a propósito: Postgres mira el permiso de EXECUTE de cada función de
  -- una expresión al prepararla, aunque `false and f()` no llegue a llamarla. Así,
  -- un UPDATE de la app que manda el mismo full_name ni siquiera la prepara.
  if new.full_name is distinct from old.full_name then
    if public.api_nombre_de_integracion(new.id, new.full_name) then
      raise exception using errcode = 'MV422',
        message = 'perfil_nombre_de_integracion: ese nombre es el nombre visible de una integración de la agencia';
    end if;
  end if;
  return new;
end;
$$;

-- ─── get_karma_profile: el bot no suma Actividad ─────────────────────────────
-- El cuerpo de prod (huella 1aa22eb9… el 01/10; el repo tenía otro) con una línea:
-- los mensajes por API no cuentan para la estrella Actividad, que mide a la persona y
-- no a su integración (decisión abierta 7). msgs_recv_30d (solo admins) sigue igual.
CREATE OR REPLACE FUNCTION public.get_karma_profile(target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  select coalesce(
    (select c.email_address from mail_credentials c where c.user_id = target and c.revoked_at is null limit 1),
    (select u.email from auth.users u where u.id = target)
  ) into v_email;

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
    and api_key_id is null
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

-- ════ 9. Las RPC ═════════════════════════════════════════════════════════════

-- ─── Lo que la edge necesita de la key ───────────────────────────────────────
-- GET /me: null sin key, null para una key sin messenger:write (sin error: /me anda
-- para toda key) y, con write, el nombre visible, los topes y lo que queda.
create or replace function public.api_mi_llave()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  _id uuid := public.api_mvk();
  _k public.api_keys;
  _c public.api_escritura_cupos;
  _min  timestamptz := date_trunc('minute', now());
  _hora timestamptz := date_trunc('hour', now());
  _dia  date := (now() at time zone 'America/Bogota')::date;
begin
  if _id is null or not exists (select 1 from public.api_keys k where k.id = _id and 'messenger:write' = any (k.scopes)) then
    return null;
  end if;
  _k := public.api_llave_valida(_id, true);
  select * into _c from public.api_escritura_cupos c where c.clave = 'llave:' || _k.id::text;
  if not found then
    return jsonb_build_object('display_name', _k.api_display_name, 'limits', null, 'remaining', null);
  end if;
  return jsonb_build_object(
    'display_name', _k.api_display_name,
    'limits', jsonb_build_object(
      'messages_per_minute', _c.lim_msj_min, 'messages_per_hour', _c.lim_msj_hora, 'messages_per_day', _c.lim_msj_dia,
      'recipients_per_minute', _c.lim_dest_min, 'recipients_per_hour', _c.lim_dest_hora, 'recipients_per_day', _c.lim_dest_dia,
      'new_chats_per_day', _c.lim_chats_dia, 'edits_per_minute', _c.lim_edic_min, 'edits_per_hour', _c.lim_edic_hora),
    'remaining', jsonb_build_object(
      'messages_minute', greatest(_c.lim_msj_min - case when _c.min_inicio >= _min then _c.min_msj else 0 end, 0),
      'messages_hour', greatest(_c.lim_msj_hora - case when _c.hora_inicio >= _hora then _c.hora_msj else 0 end, 0),
      'messages_day', greatest(_c.lim_msj_dia - case when _c.dia_inicio >= _dia then _c.dia_msj else 0 end, 0),
      'recipients_minute', greatest(_c.lim_dest_min - case when _c.min_inicio >= _min then _c.min_dest else 0 end, 0),
      'recipients_hour', greatest(_c.lim_dest_hora - case when _c.hora_inicio >= _hora then _c.hora_dest else 0 end, 0),
      'recipients_day', greatest(_c.lim_dest_dia - case when _c.dia_inicio >= _dia then _c.dia_dest else 0 end, 0),
      'new_chats_day', greatest(_c.lim_chats_dia - case when _c.dia_inicio >= _dia then _c.dia_chats else 0 end, 0),
      'edits_minute', greatest(_c.lim_edic_min - case when _c.min_inicio >= _min then _c.min_edic else 0 end, 0),
      'edits_hour', greatest(_c.lim_edic_hora - case when _c.hora_inicio >= _hora then _c.hora_edic else 0 end, 0)));
end;
$$;

-- ─── A quién se le puede escribir ────────────────────────────────────────────
-- Pide messenger:write (la app no la puede usar: sin key, MV401). Sin la persona de
-- la key. _q sin acentos; % y _ se escapan. Devuelve _limite + 1 filas (has_more).
create or replace function public.messenger_directorio(_q text default null, _limite integer default 50, _desde integer default 0)
returns table (id uuid, name text, avatar_url text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  _k jsonb := public.api_llave_del_pedido(true);
  _agencia uuid := (_k ->> 'tenant_id')::uuid;
  _lim integer := least(greatest(coalesce(_limite, 50), 1), 100);
  _patron text;
begin
  if nullif(btrim(coalesce(_q, '')), '') is not null then
    _patron := '%' || replace(replace(replace(public.api_sin_acentos(btrim(_q)), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
  select p.id, p.full_name, p.avatar_url
    from public.profiles p
    join public.tenant_members tm on tm.user_id = p.id and tm.tenant_id = _agencia
   where p.id <> auth.uid()
     and public.api_persona_alcanzable(p.id, _agencia)
     and (_patron is null or public.api_sin_acentos(p.full_name) like _patron)
   order by p.full_name nulls last, p.id
   limit _lim + 1 offset greatest(coalesce(_desde, 0), 0);
end;
$$;

create or replace function public.messenger_persona_alcanzable(_otro uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  _k jsonb := public.api_llave_del_pedido(true);
begin
  return _otro is distinct from auth.uid() and public.api_persona_alcanzable(_otro, (_k ->> 'tenant_id')::uuid);
end;
$$;

-- ¿Ese mensaje lo mandó la misma integración que la key del pedido? (editar y borrar).
create or replace function public.api_misma_integracion(_llave uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  _k jsonb := public.api_llave_del_pedido(false);
begin
  return exists (select 1 from public.api_keys k
                  where k.id = _llave and k.integracion_id = (_k ->> 'integracion_id')::uuid);
end;
$$;

-- ─── La idempotencia ─────────────────────────────────────────────────────────
-- La key sale del claim, nunca de un parámetro. La huella no sale de la base: se
-- compara aquí adentro.
create or replace function public.api_idem_clave(_idem text)
returns bytea
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
begin
  if _idem is null or _idem !~ '^[!-~]{8,100}$' then
    raise exception using errcode = 'MV422',
      message = 'api_idempotencia_invalida: la Idempotency-Key va de 8 a 100 caracteres ASCII visibles, sin espacios',
      detail = '{"error": "invalid_idempotency_key"}';
  end if;
  return sha256(convert_to(_idem, 'UTF8'));
end;
$$;

create or replace function public.api_idem_buscar(_clave bytea, _huella bytea)
returns table (coincide boolean, conversation_id uuid, message_id uuid, conversacion_creada boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  _k jsonb := public.api_llave_del_pedido(true);
begin
  return query
  select i.huella_sha = _huella, i.conversation_id, i.message_id, i.conversacion_creada
    from public.api_escritura_idem i
   where i.api_key_id = (_k ->> 'id')::uuid and i.clave_sha = _clave
     and i.created_at > now() - interval '72 hours';
end;
$$;

-- Una fila vencida (más de 72 h y todavía sin purgar) se reemplaza. Una vigente no:
-- con el candado por key de las RPC no puede haber dos pedidos de la misma key a la
-- vez, así que si pasa, se rechaza todo el pedido (el mensaje vuelve atrás con él).
create or replace function public.api_idem_guardar(_clave bytea, _huella bytea, _conv uuid, _msg uuid, _creada boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _k jsonb := public.api_llave_del_pedido(true);
begin
  insert into public.api_escritura_idem as i (api_key_id, clave_sha, huella_sha, conversation_id, message_id, conversacion_creada)
  values ((_k ->> 'id')::uuid, _clave, _huella, _conv, _msg, coalesce(_creada, false))
  on conflict (api_key_id, clave_sha) do update
     set huella_sha = excluded.huella_sha, conversation_id = excluded.conversation_id,
         message_id = excluded.message_id, conversacion_creada = excluded.conversacion_creada,
         created_at = excluded.created_at
   where i.created_at <= now() - interval '72 hours';
  if not found then
    raise exception using errcode = 'MV429',
      message = 'api_escritura_en_curso: esa Idempotency-Key ya se está usando',
      detail = '{"limite": "concurrent_write", "reintentar_en": 1}';
  end if;
end;
$$;

-- El mensaje como lo ve quien pregunta (por la RLS), con las columnas que formatea
-- la edge.
create or replace function public.api_mensaje_json(_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select to_jsonb(x) from (
    select m.id, m.conversation_id, m.sender_id, m.content, m.type, m.reply_to_id, m.is_thread_reply,
           m.is_edited, m.is_deleted, m.created_at, m.updated_at, m.api_key_id, m.api_display_name
      from public.chat_messages m where m.id = _id) x
$$;

-- ─── Las 4 de escritura ──────────────────────────────────────────────────────
-- INVOKER: corren con la sesión de la persona de la key, así que la RLS y los
-- triggers se aplican igual que en la app. El prefijo común, antes de cualquier otro
-- candado o escritura: la key, el interruptor y el freno, y el candado por key (una
-- repetición que llega mientras el original sigue en la base recibe 429, nunca un
-- 503 genérico). lock_timeout de 500 ms: el candado de la conversación y las filas
-- de cupo no esperan más que eso (55P03 = la transacción volvió atrás entera).
-- ⚠️ La edge las llama con .rpc() por POST, nunca con {get:true} ni head.
create or replace function public.api_messenger_enviar(
  _conversacion uuid, _texto text, _responde_a uuid default null, _en_hilo boolean default false, _idem text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
set lock_timeout = '500ms'
as $$
declare
  _k jsonb := public.api_llave_del_pedido(true);
  _clave bytea;
  _huella bytea;
  _r record;
  _id uuid;
begin
  perform public.api_escritura_habilitada();
  if not pg_try_advisory_xact_lock(hashtextextended('api_escritura:' || (_k ->> 'id'), 0)) then
    raise exception using errcode = 'MV429',
      message = 'api_escritura_en_curso: hay otro pedido de esta key en curso',
      detail = '{"limite": "concurrent_write", "reintentar_en": 1}';
  end if;
  _clave := public.api_idem_clave(_idem);
  _huella := sha256(convert_to(jsonb_build_array('enviar', _conversacion, _texto, _responde_a, coalesce(_en_hilo, false))::text, 'UTF8'));
  select * into _r from public.api_idem_buscar(_clave, _huella);
  if found then
    if not _r.coincide then
      raise exception using errcode = 'MV409',
        message = 'api_idempotencia_reusada: esa Idempotency-Key ya se usó con otro pedido',
        detail = '{"error": "idempotency_key_reused"}';
    end if;
    if public.api_mensaje_json(_r.message_id) is null then
      raise exception using errcode = 'MV404',
        message = 'api_conversacion_no_encontrada: la conversación de ese pedido ya no existe',
        detail = '{"error": "conversation_not_found"}';
    end if;
    return jsonb_build_object('repetido', true, 'conversation_id', _r.conversation_id,
                              'message', public.api_mensaje_json(_r.message_id));
  end if;
  if not exists (select 1 from public.chat_conversations c where c.id = _conversacion) then
    raise exception using errcode = 'MV404',
      message = 'api_conversacion_no_encontrada: esa conversación no existe o la persona de la key no está',
      detail = '{"error": "conversation_not_found"}';
  end if;
  insert into public.chat_messages (conversation_id, sender_id, content, type, reply_to_id, is_thread_reply)
  values (_conversacion, auth.uid(), _texto, 'text', _responde_a, coalesce(_en_hilo, false))
  returning id into _id;
  perform public.api_idem_guardar(_clave, _huella, _conversacion, _id, false);
  return jsonb_build_object('repetido', false, 'conversation_id', _conversacion, 'message', public.api_mensaje_json(_id));
end;
$$;

-- Un directo con su primer mensaje, en la misma transacción (nunca queda un directo
-- vacío). Si ya hay un directo, el canónico (chat_directo_con, A5b).
create or replace function public.api_messenger_abrir_directo(_con uuid, _texto text, _idem text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
set lock_timeout = '500ms'
as $$
declare
  _k jsonb := public.api_llave_del_pedido(true);
  _clave bytea;
  _huella bytea;
  _r record;
  _conv uuid;
  _creada boolean := false;
  _id uuid;
begin
  perform public.api_escritura_habilitada();
  if not pg_try_advisory_xact_lock(hashtextextended('api_escritura:' || (_k ->> 'id'), 0)) then
    raise exception using errcode = 'MV429',
      message = 'api_escritura_en_curso: hay otro pedido de esta key en curso',
      detail = '{"limite": "concurrent_write", "reintentar_en": 1}';
  end if;
  if _con is not distinct from auth.uid() then
    raise exception using errcode = 'MV422',
      message = 'api_consigo_mismo: la key no se abre un chat con su propia persona',
      detail = '{"error": "cannot_message_self"}';
  end if;
  _clave := public.api_idem_clave(_idem);
  _huella := sha256(convert_to(jsonb_build_array('abrir', _con, _texto)::text, 'UTF8'));
  select * into _r from public.api_idem_buscar(_clave, _huella);
  if found then
    if not _r.coincide then
      raise exception using errcode = 'MV409',
        message = 'api_idempotencia_reusada: esa Idempotency-Key ya se usó con otro pedido',
        detail = '{"error": "idempotency_key_reused"}';
    end if;
    if public.api_mensaje_json(_r.message_id) is null then
      raise exception using errcode = 'MV404',
        message = 'api_conversacion_no_encontrada: la conversación de ese pedido ya no existe',
        detail = '{"error": "conversation_not_found"}';
    end if;
    return jsonb_build_object('repetido', true, 'conversation_id', _r.conversation_id, 'created', _r.conversacion_creada,
                              'message', public.api_mensaje_json(_r.message_id));
  end if;
  if _con is null or not public.messenger_persona_alcanzable(_con) then
    raise exception using errcode = 'MV404',
      message = 'api_persona_no_encontrada: a esa persona no se le puede escribir por API',
      detail = '{"error": "person_not_found"}';
  end if;
  -- El mismo candado del par que toma A al sumar al segundo de un directo.
  perform pg_advisory_xact_lock(public.chat_llave_de_par(auth.uid(), _con));
  _conv := public.chat_directo_con(_con);
  if _conv is null then
    _conv := gen_random_uuid();
    -- Sin RETURNING, como la app: la política SELECT pide ser participante.
    insert into public.chat_conversations (id, type, created_by) values (_conv, 'direct', auth.uid());
    insert into public.chat_participants (conversation_id, user_id, role) values (_conv, auth.uid(), 'admin');
    insert into public.chat_participants (conversation_id, user_id, role) values (_conv, _con, 'member');
    _creada := true;
  end if;
  insert into public.chat_messages (conversation_id, sender_id, content, type)
  values (_conv, auth.uid(), _texto, 'text')
  returning id into _id;
  perform public.api_idem_guardar(_clave, _huella, _conv, _id, _creada);
  return jsonb_build_object('repetido', false, 'conversation_id', _conv, 'created', _creada, 'message', public.api_mensaje_json(_id));
end;
$$;

-- Editar y borrar: solo lo que mandó la MISMA integración. Un código por caso, en
-- este orden: 404, not_your_message, not_an_api_message, other_integration_message,
-- y 409 (editar) o already_deleted (borrar).
create or replace function public.api_messenger_editar(_conversacion uuid, _mensaje uuid, _texto text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
set lock_timeout = '500ms'
as $$
declare
  _k jsonb := public.api_llave_del_pedido(true);
  _m record;
begin
  perform public.api_escritura_habilitada();
  if not pg_try_advisory_xact_lock(hashtextextended('api_escritura:' || (_k ->> 'id'), 0)) then
    raise exception using errcode = 'MV429',
      message = 'api_escritura_en_curso: hay otro pedido de esta key en curso',
      detail = '{"limite": "concurrent_write", "reintentar_en": 1}';
  end if;
  select m.id, m.sender_id, m.api_key_id, m.is_deleted, m.content into _m
    from public.chat_messages m where m.id = _mensaje and m.conversation_id = _conversacion;
  if not found then
    raise exception using errcode = 'MV404', message = 'api_mensaje_no_encontrado: ese mensaje no existe en esa conversación',
      detail = '{"error": "not_found"}';
  end if;
  if _m.sender_id is distinct from auth.uid() then
    raise exception using errcode = 'MV403', message = 'api_no_es_tuyo: ese mensaje es de otra persona',
      detail = '{"error": "not_your_message"}';
  end if;
  if _m.api_key_id is null then
    raise exception using errcode = 'MV403', message = 'api_mensaje_escrito_a_mano: ese mensaje no lo mandó una integración',
      detail = '{"error": "not_an_api_message"}';
  end if;
  if not public.api_misma_integracion(_m.api_key_id) then
    raise exception using errcode = 'MV403', message = 'api_otra_integracion: ese mensaje lo mandó otra integración',
      detail = '{"error": "other_integration_message"}';
  end if;
  if _m.is_deleted then
    raise exception using errcode = 'MV409', message = 'api_mensaje_borrado: ese mensaje ya está borrado',
      detail = '{"error": "message_deleted"}';
  end if;
  -- Con el mismo texto no se escribe nada (ni se gasta una edición).
  if public.api_texto_normalizado(_texto) is not distinct from _m.content then
    return jsonb_build_object('cambiado', false, 'message', public.api_mensaje_json(_mensaje));
  end if;
  update public.chat_messages set content = _texto, is_edited = true, content_rich = null where id = _mensaje;
  return jsonb_build_object('cambiado', true, 'message', public.api_mensaje_json(_mensaje));
end;
$$;

create or replace function public.api_messenger_borrar(_conversacion uuid, _mensaje uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
set lock_timeout = '500ms'
as $$
declare
  _k jsonb := public.api_llave_del_pedido(true);
  _m record;
  _r jsonb;
begin
  perform public.api_escritura_habilitada();
  if not pg_try_advisory_xact_lock(hashtextextended('api_escritura:' || (_k ->> 'id'), 0)) then
    raise exception using errcode = 'MV429',
      message = 'api_escritura_en_curso: hay otro pedido de esta key en curso',
      detail = '{"limite": "concurrent_write", "reintentar_en": 1}';
  end if;
  select m.id, m.sender_id, m.api_key_id, m.is_deleted into _m
    from public.chat_messages m where m.id = _mensaje and m.conversation_id = _conversacion;
  if not found then
    raise exception using errcode = 'MV404', message = 'api_mensaje_no_encontrado: ese mensaje no existe en esa conversación',
      detail = '{"error": "not_found"}';
  end if;
  if _m.sender_id is distinct from auth.uid() then
    raise exception using errcode = 'MV403', message = 'api_no_es_tuyo: ese mensaje es de otra persona',
      detail = '{"error": "not_your_message"}';
  end if;
  if _m.api_key_id is null then
    raise exception using errcode = 'MV403', message = 'api_mensaje_escrito_a_mano: ese mensaje no lo mandó una integración',
      detail = '{"error": "not_an_api_message"}';
  end if;
  if not public.api_misma_integracion(_m.api_key_id) then
    raise exception using errcode = 'MV403', message = 'api_otra_integracion: ese mensaje lo mandó otra integración',
      detail = '{"error": "other_integration_message"}';
  end if;
  if _m.is_deleted then
    return jsonb_build_object('id', _mensaje, 'already_deleted', true);
  end if;
  -- El mismo borrado que la app: archiva para los admins (con las marcas) y vacía.
  _r := public.delete_chat_message(_mensaje);
  if not coalesce((_r ->> 'ok')::boolean, false) then
    raise exception using errcode = 'MV404', message = 'api_mensaje_no_encontrado: no se pudo borrar (' || coalesce(_r ->> 'error', '?') || ')',
      detail = '{"error": "not_found"}';
  end if;
  return jsonb_build_object('id', _mensaje, 'already_deleted', coalesce((_r ->> 'already')::boolean, false));
end;
$$;

-- ─── La retirada de emergencia ───────────────────────────────────────────────
-- Un admin de la agencia de la key, o la persona de la key, retira lo que mandó una
-- integración (TODAS sus keys) desde _desde: lo archiva (con la marca y quien
-- retira), lo vacía y se lleva sus notificaciones (de todos, también de quien ya
-- salió). Anda con la key revocada o vencida
-- y no depende del interruptor ni del freno: es manual y acotada (como mucho 200
-- mensajes por llamada, para acotar los eventos de Realtime). La API no la puede usar.
create or replace function public.api_retirar_mensajes_de_integracion(_llave uuid, _desde timestamptz, _limite integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _uid uuid := auth.uid();
  _k public.api_keys;
  _lim integer := least(greatest(coalesce(_limite, 200), 1), 200);
  _m record;
  _hechos integer := 0;
  _quedan integer;
  _enlaces text[] := '{}';
begin
  if (auth.jwt() ?| array['mvf', 'mvk']) is true then
    raise exception using errcode = 'MV403',
      message = 'api_retirada_no_por_api: la retirada se hace desde Maven, no con una key',
      detail = '{"error": "forbidden"}';
  end if;
  if _uid is null then
    raise exception using errcode = 'MV401', message = 'api_retirada_sin_sesion: hace falta una sesión',
      detail = '{"error": "unauthorized"}';
  end if;
  select * into _k from public.api_keys k where k.id = _llave;
  if not found then
    raise exception using errcode = 'MV404', message = 'api_retirada_sin_llave: esa key no existe',
      detail = '{"error": "not_found"}';
  end if;
  if not (_uid = _k.acts_as_user_id
          or (public.is_in_role_group(_uid, 'admin')
              and exists (select 1 from public.tenant_members tm where tm.user_id = _uid and tm.tenant_id = _k.tenant_id))) then
    raise exception using errcode = 'MV403',
      message = 'api_retirada_no_autorizada: retira un admin de la agencia o la persona de la key',
      detail = '{"error": "forbidden"}';
  end if;

  for _m in
    select m.id, m.conversation_id, m.sender_id, m.content, m.type, m.api_key_id, m.api_display_name
      from public.chat_messages m
     where m.api_key_id in (select k.id from public.api_keys k where k.integracion_id = _k.integracion_id)
       and not m.is_deleted
       and m.created_at >= coalesce(_desde, '-infinity'::timestamptz)
     order by m.created_at, m.id
     limit _lim
  loop
    insert into public.chat_message_deletions (message_id, conversation_id, sender_id, deleted_by, content, type,
                                               api_key_id, api_display_name)
    values (_m.id, _m.conversation_id, _m.sender_id, _uid, _m.content, _m.type, _m.api_key_id, _m.api_display_name)
    on conflict (message_id) do nothing;
    perform set_config('maven.borrado_autorizado', _m.id::text, true);
    update public.chat_messages
       set is_deleted = true, content = null, content_rich = null, file_url = null, file_name = null, file_size = null
     where id = _m.id;
    perform set_config('maven.borrado_autorizado', '', true);
    _enlaces := _enlaces || ('/messenger?c=' || _m.conversation_id || '&m=' || _m.id);
    _hechos := _hechos + 1;
  end loop;

  -- Las notificaciones, de una vez: un solo recorrido de notifications para todos los
  -- mensajes (deep_link_url no tiene índice; uno por mensaje en el grupo más grande de
  -- prod, 41 personas y 175 mil notificaciones, eran 278 ms cada uno, y 200 se pasaban
  -- de los 8 s de statement_timeout: no se retiraba nada). Y de todos, también de quien
  -- ya salió de la conversación: el texto tampoco tiene que quedarle.
  if _hechos > 0 then
    delete from public.notifications n
     using unnest(_enlaces) l(enlace)
     where n.deep_link_url = l.enlace and n.reference_type = 'conversation';
  end if;

  select count(*) into _quedan
    from (select 1 from public.chat_messages m
           where m.api_key_id in (select k.id from public.api_keys k where k.integracion_id = _k.integracion_id)
             and not m.is_deleted
             and m.created_at >= coalesce(_desde, '-infinity'::timestamptz)
           limit 1001) x;
  return jsonb_build_object('retirados', _hechos, 'quedan', _quedan);
end;
$$;

-- ════ 10. Permisos ═══════════════════════════════════════════════════════════
-- CREATE FUNCTION le da EXECUTE a PUBLIC, y los privilegios por defecto de public
-- también a anon y authenticated. Nada nuevo lo ejecuta anon ni PUBLIC; las internas
-- y las de trigger, tampoco authenticated.
do $$
declare
  _f text;
begin
  foreach _f in array array[
    -- internas y de trigger
    'api_fuente_backends()', 'api_fuente_slot()', 'api_fuente_cola()', 'api_presion_medida()',
    'api_cupo_gastar(text, integer, integer, integer, integer)', 'api_mvk()', 'api_llave_valida(uuid, boolean)',
    'api_persona_alcanzable(uuid, uuid)', 'chat_messages_api()', 'chat_messages_api_editar()',
    'chat_conversations_api()', 'chat_participants_api()', 'api_keys_nombre_visible()',
    'api_keys_cupos_de_escritura()', 'api_esqueleto(text)', 'api_sin_acentos(text)', 'api_texto_es_valido(text)',
    -- La usa profiles_nombre_lo_cambia_un_admin (INVOKER), que con sesión de usuario
    -- se corta antes (A) y con el mismo full_name ni la prepara (IF anidado). Abierta a
    -- authenticated sería un oráculo de los nombres visibles de OTRA agencia.
    'api_nombre_de_integracion(uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', _f);
  end loop;
  foreach _f in array array[
    -- las que llama la sesión fabricada (directa o desde una RPC INVOKER)
    'api_escritura_habilitada()', 'api_llave_del_pedido(boolean)', 'api_mi_llave()',
    'messenger_directorio(text, integer, integer)', 'messenger_persona_alcanzable(uuid)', 'api_misma_integracion(uuid)',
    'api_idem_clave(text)', 'api_idem_buscar(bytea, bytea)', 'api_idem_guardar(bytea, bytea, uuid, uuid, boolean)',
    'api_mensaje_json(uuid)', 'api_texto_normalizado(text)',
    'api_messenger_enviar(uuid, text, uuid, boolean, text)', 'api_messenger_abrir_directo(uuid, text, text)',
    'api_messenger_editar(uuid, uuid, text)', 'api_messenger_borrar(uuid, uuid)',
    -- la retirada la llama la app (PR 5)
    'api_retirar_mensajes_de_integracion(uuid, timestamptz, integer)'] loop
    execute format('revoke all on function public.%s from public, anon', _f);
    execute format('grant execute on function public.%s to authenticated', _f);
  end loop;
  -- El admin cambia nombres con service_role (admin-user-actions).
  grant execute on function public.api_nombre_de_integracion(uuid, text) to service_role;
end $$;

-- ════ 11. La purga de la idempotencia ════════════════════════════════════════
-- Diaria, SQL puro (sin pg_net). 04:23 de Bogotá.
select cron.unschedule('api-escritura-idem-purga')
where exists (select 1 from cron.job where jobname = 'api-escritura-idem-purga');
select cron.schedule('api-escritura-idem-purga', '23 9 * * *',
  $cron$delete from public.api_escritura_idem where created_at < now() - interval '72 hours'$cron$);

reset lock_timeout;
