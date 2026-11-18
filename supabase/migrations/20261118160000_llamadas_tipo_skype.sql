-- LLAMADAS TIPO SKYPE (Alvaro, 18/11/2026): agregar gente a una llamada en
-- curso, que en los grupos suene a todos, y que la llamada deje su rastro en la
-- conversación («Llamada perdida», «Llamada de video · 12 min»).
--
-- 1. El timbre pasa a ser por persona: cada invitado es una fila 'ringing' en
--    call_participants (la tabla ya existía). `calls.receiver_id` sigue para el
--    1 a 1 de siempre.
-- 2. Cualquiera que ya esté en la llamada puede invitar a otro de su agencia
--    (call_participants_agencia ya lo frena si no es de la agencia).
-- 3. Al terminar, la base deja el aviso en el chat (aviso de sistema).

-- Las bases de prueba parciales (bancos PGlite) no traen las tablas de
-- llamadas: ahí esta parte se salta.
do $$
begin
  if to_regclass('public.call_participants') is null or to_regclass('public.calls') is null then
    return;
  end if;

  -- Realtime: el timbre a cada invitado y el «rechazó / no contestó» a quien llama.
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'call_participants'
     ) then
    execute 'alter publication supabase_realtime add table public.call_participants';
  end if;

  execute 'alter table public.call_participants add column if not exists invitado_por uuid references auth.users(id)';
  execute 'alter table public.call_participants add column if not exists actualizado timestamptz not null default now()';
  execute 'create index if not exists call_participants_user_status_idx on public.call_participants (user_id, status)';

  -- Los que están en la llamada se ven entre sí (para saber a quién ya se invitó).
  execute $p$alter policy "Users can view their call participations" on public.call_participants
    using (
      user_id = (select auth.uid())
      or public.is_call_creator((select auth.uid()), call_id)
      or public.is_call_participant((select auth.uid()), call_id)
    )$p$;

  -- Invitar: quien creó la llamada o cualquiera que ya esté en ella. Uno mismo
  -- puede sumarse (entrar por link).
  execute $p$alter policy "Call creators can insert participants" on public.call_participants
    with check (
      public.is_call_creator((select auth.uid()), call_id)
      or user_id = (select auth.uid())
      or public.is_call_participant((select auth.uid()), call_id)
    )$p$;
end $$;

-- ── El rastro de la llamada en la conversación ──────────────────────────────
create or replace function public.llamada_al_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _estado text;
  _segundos int;
  _id uuid := gen_random_uuid();
  _tipo text := coalesce(new.call_type, 'video');
  _texto text;
begin
  if new.conversation_id is null then
    return new;
  end if;
  if new.call_status not in ('ended', 'declined') or old.call_status in ('ended', 'declined') then
    return new;
  end if;

  if new.start_time is null then
    _estado := case when new.call_status = 'declined' then 'rechazada' else 'perdida' end;
  else
    _estado := 'terminada';
    _segundos := greatest(0, extract(epoch from (coalesce(new.end_time, now()) - new.start_time))::int);
  end if;

  -- El texto queda en español como respaldo; la app lo dibuja traducido con
  -- content_rich.llamada.
  _texto := case _estado
    when 'perdida' then '📞 Llamada perdida'
    when 'rechazada' then '📞 Llamada rechazada'
    else format('📞 Llamada de %s · %s min', case when _tipo = 'audio' then 'voz' else 'video' end, greatest(1, round(_segundos / 60.0)::int))
  end;

  perform set_config('maven.evento_sistema', _id::text, true);
  insert into public.chat_messages (id, conversation_id, sender_id, type, content, content_rich)
  values (
    _id, new.conversation_id, new.caller_id, 'system', _texto,
    jsonb_build_object('llamada', jsonb_build_object('estado', _estado, 'tipo', _tipo, 'segundos', _segundos, 'grupo', new.is_group))
  );
  perform set_config('maven.evento_sistema', '', true);
  return new;
exception when others then
  -- El chat nunca frena que la llamada se cierre.
  raise warning 'llamada_al_chat: % (llamada %)', sqlerrm, new.id;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.calls') is null then
    return;
  end if;
  execute 'drop trigger if exists llamada_al_chat on public.calls';
  execute 'create trigger llamada_al_chat after update of call_status on public.calls for each row execute function public.llamada_al_chat()';
end $$;

-- Las notificaciones de la campana: la llamada perdida sí avisa; «Llamada de
-- video · 12 min» no (los que hablaron ya lo saben).
create or replace function public.notify_chat_message()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  participant record;
  sender_name text;
  conv_name text;
  msg_preview text;
  es_mencion boolean;
begin
  if new.type = 'system' and new.content_rich ? 'llamada'
     and coalesce(new.content_rich->'llamada'->>'estado', '') <> 'perdida' then
    return new;
  end if;

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
