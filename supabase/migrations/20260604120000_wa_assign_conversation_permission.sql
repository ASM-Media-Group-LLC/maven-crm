-- WhatsApp / Asignar conversaciones — candado por permiso (Slice 1).
--
-- Hasta ahora CUALQUIER miembro del canal podía cambiar wa_conversations.assigned_to
-- (la policy UPDATE lo permitía via API). Ahora la asignación pasa por un RPC
-- gateado por has_permission(WhatsApp, "Asignar conversaciones") — admin siempre
-- puede; el resto solo si el admin le prende el permiso por rol desde Administración.
--
-- La AUTO-asignación al abrir (wa-inbox-open corre con service_role) NO se afecta:
-- el service_role bypassa RLS, así que el closer que abre la conversación por
-- primera vez se la sigue auto-asignando sin necesitar este permiso.

-- ── RPC de asignación (single — en Slice 2 pasa a multi) ─────────────────────
create or replace function public.wa_assign_conversation(
  p_conversation_id uuid,
  p_assignee uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission(auth.uid(), 'WhatsApp', 'Asignar conversaciones') then
    raise exception 'No tenés permiso para asignar conversaciones.' using errcode = '42501';
  end if;

  -- La conversación debe existir en el tenant del que llama.
  if not exists (
    select 1 from public.wa_conversations
    where id = p_conversation_id and tenant_id = public.current_tenant_id()
  ) then
    raise exception 'Conversación no encontrada.' using errcode = 'P0002';
  end if;

  update public.wa_conversations
  set assigned_to = p_assignee
  where id = p_conversation_id and tenant_id = public.current_tenant_id();

  return p_conversation_id;
end;
$$;

grant execute on function public.wa_assign_conversation(uuid, uuid) to authenticated;

-- ── Endurecer la policy UPDATE ───────────────────────────────────────────────
-- El único UPDATE directo que hacía el front sobre wa_conversations era assigned_to
-- (ahora va por el RPC de arriba). Los demás cambios de estado los hace el
-- service_role en edge functions (bypassa RLS). Así que restringir el UPDATE
-- directo a "tiene el permiso" cierra el bypass por API sin romper el flujo normal.
drop policy if exists wa_conversations_update on public.wa_conversations;
create policy wa_conversations_update on public.wa_conversations
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_permission(auth.uid(), 'WhatsApp', 'Asignar conversaciones')
  )
  with check (tenant_id = public.current_tenant_id());
