-- Acciones de la LISTA de conversaciones de Telegram (espejo de WhatsApp): fijar, archivar,
-- favorito, marcar no leído + vaciar/eliminar (admin). El UPDATE/DELETE de tg_conversations es
-- deny-all para clientes → todo va por RPCs SECURITY DEFINER con gating por visibilidad.

-- Marca "no leído" manual (como wa_conversations.manually_unread): mostrar un chat como no leído
-- aunque unread_count sea 0.
alter table public.tg_conversations add column if not exists manually_unread boolean not null default false;

-- Setter de flags (archived/pinned/favorite/manually_unread). Gating = misma visibilidad que la RLS.
create or replace function public.tg_set_conversation_flag(p_conversation_id uuid, p_flag text, p_value boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_flag not in ('archived', 'pinned', 'favorite', 'manually_unread') then
    raise exception 'flag inválido: %', p_flag;
  end if;
  if not exists (
    select 1 from public.tg_conversations c
    where c.id = p_conversation_id
      and (public.has_tg_inbox_global_scope(auth.uid())
           or c.assigned_to = auth.uid()
           or public.is_tg_assignee(c.id, auth.uid()))
  ) then
    raise exception 'sin acceso a la conversación';
  end if;
  update public.tg_conversations set
    archived        = case when p_flag = 'archived'        then p_value else archived end,
    pinned          = case when p_flag = 'pinned'          then p_value else pinned end,
    favorite        = case when p_flag = 'favorite'        then p_value else favorite end,
    manually_unread = case when p_flag = 'manually_unread' then p_value else manually_unread end,
    updated_at = now()
  where id = p_conversation_id;
end $$;
grant execute on function public.tg_set_conversation_flag(uuid, text, boolean) to authenticated;

-- Vaciar (borra mensajes, conserva la conversación) — solo admin.
create or replace function public.tg_clear_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_in_role_group(auth.uid(), 'admin') then raise exception 'solo admin'; end if;
  delete from public.tg_messages where conversation_id = p_conversation_id;
  update public.tg_conversations
    set last_message_preview = null, last_message_at = null, unread_count = 0, manually_unread = false
    where id = p_conversation_id;
end $$;
grant execute on function public.tg_clear_conversation(uuid) to authenticated;

-- Eliminar la conversación entera — solo admin.
create or replace function public.tg_delete_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_in_role_group(auth.uid(), 'admin') then raise exception 'solo admin'; end if;
  delete from public.tg_messages where conversation_id = p_conversation_id;
  delete from public.tg_conversation_assignees where conversation_id = p_conversation_id;
  delete from public.tg_conversations where id = p_conversation_id;
end $$;
grant execute on function public.tg_delete_conversation(uuid) to authenticated;
