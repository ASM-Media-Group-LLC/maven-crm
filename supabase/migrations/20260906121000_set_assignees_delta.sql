-- Las RPC de asignados de la bandeja (WhatsApp y Telegram) hacían DELETE de
-- todos + INSERT del set completo. Con un trigger de push colgado del INSERT
-- (siguiente migración), reasignar a alguien que YA estaba le mandaría un aviso
-- fantasma "te asignaron" en cada cambio del set. Ahora es delta: se borra a
-- quien sale y se inserta solo a quien entra. Mismo permiso, mismo tenant,
-- mismo "principal" denormalizado en assigned_to.
create or replace function public.wa_conversation_set_assignees(p_conversation_id uuid, p_user_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission(auth.uid(), 'WhatsApp', 'Asignar conversaciones') then
    raise exception 'No tenés permiso para asignar conversaciones.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.wa_conversations
    where id = p_conversation_id and tenant_id = public.current_tenant_id()
  ) then
    raise exception 'Conversación no encontrada.' using errcode = 'P0002';
  end if;

  -- Delta, no reemplazo: solo salen los que ya no están en el set.
  delete from public.wa_conversation_assignees
   where conversation_id = p_conversation_id
     and (p_user_ids is null or not (user_id = any(p_user_ids)));
  if array_length(p_user_ids, 1) is not null then
    insert into public.wa_conversation_assignees (conversation_id, user_id, assigned_by)
    select p_conversation_id, uid, auth.uid()
    from unnest(p_user_ids) as uid
    on conflict (conversation_id, user_id) do nothing;
  end if;

  -- "Principal" denormalizado (compat con código/RLS que lee assigned_to).
  update public.wa_conversations
  set assigned_to = (case when array_length(p_user_ids,1) is null then null else p_user_ids[1] end)
  where id = p_conversation_id and tenant_id = public.current_tenant_id();

  return p_conversation_id;
end;
$$;

create or replace function public.tg_conversation_set_assignees(p_conversation_id uuid, p_user_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission(auth.uid(), 'Telegram', 'Asignar conversaciones') then
    raise exception 'No tienes permiso para asignar conversaciones.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.tg_conversations
    where id = p_conversation_id and tenant_id = public.current_tenant_id()
  ) then
    raise exception 'Conversación no encontrada.' using errcode = 'P0002';
  end if;

  delete from public.tg_conversation_assignees
   where conversation_id = p_conversation_id
     and (p_user_ids is null or not (user_id = any(p_user_ids)));
  if array_length(p_user_ids, 1) is not null then
    insert into public.tg_conversation_assignees (conversation_id, user_id, assigned_by)
    select p_conversation_id, uid, auth.uid()
    from unnest(p_user_ids) as uid
    on conflict (conversation_id, user_id) do nothing;
  end if;

  update public.tg_conversations
  set assigned_to = (case when array_length(p_user_ids,1) is null then null else p_user_ids[1] end)
  where id = p_conversation_id and tenant_id = public.current_tenant_id();

  return p_conversation_id;
end;
$$;
