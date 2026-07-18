-- FIX RLS del multi-asignado (hueco del PR #658): la migración
-- 20260625010000 extendió SOLO wa_conversations_select con is_wa_assignee,
-- pero wa_messages_select y wa_contacts_select (20260618030000) siguieron
-- gateando por assigned_to = auth.uid(). Resultado: un co-asignado SECUNDARIO
-- (sin scope global) veía la conversación en la lista pero el hilo cargaba
-- VACÍO ("Sin mensajes.") y el contacto venía null ("(sin nombre)") — la
-- multi-asignación quedaba rota justo para su destinatario. Se extienden ambas
-- policies con is_wa_assignee, igual que ya hace tg_messages_select en Telegram
-- (paridad S4).

DROP POLICY IF EXISTS wa_messages_select ON public.wa_conversation_messages;
CREATE POLICY wa_messages_select ON public.wa_conversation_messages
  FOR SELECT TO authenticated
  USING (
    tenant_id = current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.wa_conversations c
      WHERE c.id = wa_conversation_messages.conversation_id
        AND (
          public.has_wa_inbox_global_scope(auth.uid())
          OR c.assigned_to = auth.uid()
          OR public.is_wa_assignee(c.id, auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS wa_contacts_select ON public.wa_contacts;
CREATE POLICY wa_contacts_select ON public.wa_contacts
  FOR SELECT TO authenticated
  USING (
    tenant_id = current_tenant_id()
    AND (
      public.has_wa_inbox_global_scope(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.wa_conversations c
        WHERE c.contact_id = wa_contacts.id
          AND (c.assigned_to = auth.uid() OR public.is_wa_assignee(c.id, auth.uid()))
      )
    )
  );
