-- FIX de seguridad: la policy SELECT de wa_conversations (de 20260601170000) usaba
-- wa_can_view_channel(channel_id), que devuelve true para CUALQUIER miembro del
-- canal → un closer veía TODAS las conversaciones del canal, incluidas las asignadas
-- a OTROS. Endurecemos la visibilidad:
--   • admin / manager / supervisor (is_supervisor_or_above) → ven todo.
--   • el resto (closer/employee) → solo SUS asignadas + la cola SIN asignar de sus
--     canales (para poder tomarlas). NUNCA las asignadas a otra persona.
-- Mismo criterio en wa_conversation_messages y wa_contacts (que dependen de la conv).

drop policy if exists wa_conversations_select on public.wa_conversations;
create policy wa_conversations_select on public.wa_conversations
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.is_in_role_group(auth.uid(), 'supervisor_or_above')
      or assigned_to = auth.uid()
      or (assigned_to is null and public.wa_can_view_channel(channel_id))
    )
  );

drop policy if exists wa_messages_select on public.wa_conversation_messages;
create policy wa_messages_select on public.wa_conversation_messages
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.wa_conversations c
      where c.id = wa_conversation_messages.conversation_id
        and (
          public.is_in_role_group(auth.uid(), 'supervisor_or_above')
          or c.assigned_to = auth.uid()
          or (c.assigned_to is null and public.wa_can_view_channel(c.channel_id))
        )
    )
  );

drop policy if exists wa_contacts_select on public.wa_contacts;
create policy wa_contacts_select on public.wa_contacts
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.is_in_role_group(auth.uid(), 'supervisor_or_above')
      or exists (
        select 1 from public.wa_conversations c
        where c.contact_id = wa_contacts.id
          and (
            c.assigned_to = auth.uid()
            or (c.assigned_to is null and public.wa_can_view_channel(c.channel_id))
          )
      )
    )
  );
