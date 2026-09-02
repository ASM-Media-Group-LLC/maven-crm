-- Messenger: archivo SOLO-ADMIN del contenido de mensajes eliminados.
--
-- Antes `deleteMessage` hacía `is_deleted=true, content=null` → el contenido se
-- destruía y NADIE (ni un admin) podía verlo. Ahora, al borrar:
--   1) el original se copia a chat_message_deletions (RLS: solo admins leen), y
--   2) el mensaje visible queda vacío (content/file_url a null).
-- Así "solo los admins ven el mensaje eliminado" queda ENFORZADO en el servidor,
-- no solo escondido en la UI.
--
-- ⚠️ Los archivos siguen en el bucket público `chat-files`: quien ya tenía la URL
-- puede abrirla igual. Taparlo requiere bucket privado + URLs firmadas (tarea aparte).

create table if not exists public.chat_message_deletions (
  message_id      uuid primary key references public.chat_messages(id) on delete cascade,
  conversation_id uuid not null,
  sender_id       uuid not null,
  deleted_by      uuid not null,
  deleted_at      timestamptz not null default now(),
  content         text,
  type            text,
  file_url        text,
  file_name       text,
  file_size       bigint
);
create index if not exists chat_message_deletions_conv_idx
  on public.chat_message_deletions (conversation_id);

alter table public.chat_message_deletions enable row level security;

-- SOLO admins pueden leer el contenido eliminado (is_in_role_group es la canónica,
-- cubre también los roles custom de tier admin).
drop policy if exists "admins read deleted content" on public.chat_message_deletions;
create policy "admins read deleted content" on public.chat_message_deletions
  for select to authenticated
  using (public.is_in_role_group(auth.uid(), 'admin'));

-- Sin policies de INSERT/UPDATE/DELETE a propósito: nadie escribe directo.
-- El archivado ocurre dentro de delete_chat_message() (SECURITY DEFINER).

create or replace function public.delete_chat_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  m record;
begin
  if v_caller is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select id, conversation_id, sender_id, content, type, file_url, file_name, file_size, is_deleted
    into m
  from chat_messages
  where id = p_message_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if m.is_deleted then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  -- Solo el autor puede borrar su propio mensaje (mismo criterio que la UI).
  if m.sender_id <> v_caller then
    return jsonb_build_object('ok', false, 'error', 'not_author');
  end if;

  insert into chat_message_deletions (
    message_id, conversation_id, sender_id, deleted_by,
    content, type, file_url, file_name, file_size
  ) values (
    m.id, m.conversation_id, m.sender_id, v_caller,
    m.content, m.type, m.file_url, m.file_name, m.file_size
  )
  on conflict (message_id) do nothing;

  update chat_messages
     set is_deleted = true, content = null, file_url = null, file_name = null
   where id = m.id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.delete_chat_message(uuid) to authenticated;
