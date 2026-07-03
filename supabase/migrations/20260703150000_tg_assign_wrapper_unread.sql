-- S4 Telegram (2/2): wrapper de asignación mono-usuario + bump atómico de no-leídos.
-- Ya aplicada en prod vía MCP; idempotente.

-- Wrapper mono-usuario (espejo de wa_assign_conversation) — la UI asigna de a uno.
create or replace function public.tg_assign_conversation(p_conversation_id uuid, p_assignee uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
begin
  return public.tg_conversation_set_assignees(
    p_conversation_id,
    case when p_assignee is null then '{}'::uuid[] else array[p_assignee] end
  );
end;
$$;
grant execute on function public.tg_assign_conversation(uuid, uuid) to authenticated;

-- Bump atómico de no-leídos (lo llama telegram-ingest con service_role en cada entrante;
-- PostgREST no puede hacer col = col + 1 sin RPC). Sin esto la bandeja NUNCA marcaba
-- no-leídos (unread_count quedaba 0 → ni badge en lista, ni sidebar, ni filtro).
create or replace function public.tg_bump_unread(p_conversation_id uuid)
returns void
language sql security definer set search_path = public
as $$
  update public.tg_conversations
     set unread_count = coalesce(unread_count, 0) + 1
   where id = p_conversation_id;
$$;
revoke execute on function public.tg_bump_unread(uuid) from public, anon, authenticated;
grant execute on function public.tg_bump_unread(uuid) to service_role;

notify pgrst, 'reload schema';
