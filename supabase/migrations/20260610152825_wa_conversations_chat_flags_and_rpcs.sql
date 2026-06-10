-- Estado de cada chat en la bandeja de WhatsApp (menú de click derecho estilo WhatsApp:
-- Archivar / Fijar / Marcar no leído / Favoritos / Vaciar / Eliminar).
alter table public.wa_conversations
  add column if not exists archived boolean not null default false,
  add column if not exists pinned boolean not null default false,
  add column if not exists favorite boolean not null default false,
  add column if not exists manually_unread boolean not null default false;

-- Toggle de flags: lo puede hacer el closer ASIGNADO o un supervisor+ (mismo acceso
-- que el SELECT). SECURITY DEFINER porque la policy UPDATE de wa_conversations exige
-- el permiso "Asignar conversaciones" (que un closer no tiene) — igual que wa_mark_read.
create or replace function public.wa_set_conversation_flag(
  p_conversation_id uuid, p_flag text, p_value boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if p_flag not in ('archived','pinned','favorite','manually_unread') then
    raise exception 'flag invalido: %', p_flag;
  end if;
  if not exists (
    select 1 from public.wa_conversations c
    where c.id = p_conversation_id
      and c.tenant_id = current_tenant_id()
      and (is_in_role_group(v_uid, 'supervisor_or_above') or c.assigned_to = v_uid)
  ) then
    raise exception 'sin acceso a la conversacion';
  end if;
  execute format('update public.wa_conversations set %I = $1, updated_at = now() where id = $2', p_flag)
    using p_value, p_conversation_id;
end $$;

-- Vaciar chat (SOLO admin, SOLO bandeja de Maven): borra los mensajes, deja el chat.
create or replace function public.wa_clear_conversation(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'solo admin';
  end if;
  delete from public.wa_conversation_messages
   where conversation_id = p_conversation_id and tenant_id = current_tenant_id();
  update public.wa_conversations
     set last_message_preview = null, unread_count = 0, manually_unread = false, updated_at = now()
   where id = p_conversation_id and tenant_id = current_tenant_id();
end $$;

-- Eliminar chat (SOLO admin, SOLO bandeja de Maven): borra mensajes + conversacion.
create or replace function public.wa_delete_conversation(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'solo admin';
  end if;
  delete from public.wa_conversation_messages
   where conversation_id = p_conversation_id and tenant_id = current_tenant_id();
  delete from public.wa_conversations
   where id = p_conversation_id and tenant_id = current_tenant_id();
end $$;

grant execute on function public.wa_set_conversation_flag(uuid, text, boolean) to authenticated;
grant execute on function public.wa_clear_conversation(uuid) to authenticated;
grant execute on function public.wa_delete_conversation(uuid) to authenticated;
