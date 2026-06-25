-- Set de asignados (reemplaza el set). assigned_to = el 1° (principal). Gateado por permiso.
create or replace function public.wa_conversation_set_assignees(p_conversation_id uuid, p_user_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission(auth.uid(), 'WhatsApp', 'Asignar conversaciones') then
    raise exception 'No tenés permiso para asignar conversaciones.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.wa_conversations where id = p_conversation_id and tenant_id = public.current_tenant_id()) then
    raise exception 'Conversación no encontrada.' using errcode = 'P0002';
  end if;
  delete from public.wa_conversation_assignees where conversation_id = p_conversation_id;
  if array_length(p_user_ids, 1) is not null then
    insert into public.wa_conversation_assignees (conversation_id, user_id, assigned_by)
    select p_conversation_id, uid, auth.uid() from unnest(p_user_ids) as uid
    on conflict (conversation_id, user_id) do nothing;
  end if;
  update public.wa_conversations
  set assigned_to = (case when array_length(p_user_ids,1) is null then null else p_user_ids[1] end)
  where id = p_conversation_id and tenant_id = public.current_tenant_id();
  return p_conversation_id;
end;
$$;
grant execute on function public.wa_conversation_set_assignees(uuid, uuid[]) to authenticated;

create or replace function public.wa_assign_conversation(p_conversation_id uuid, p_assignee uuid)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  return public.wa_conversation_set_assignees(
    p_conversation_id,
    case when p_assignee is null then '{}'::uuid[] else array[p_assignee] end
  );
end;
$$;
