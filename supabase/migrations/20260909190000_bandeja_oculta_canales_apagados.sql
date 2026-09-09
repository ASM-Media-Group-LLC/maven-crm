-- La bandeja mostraba los DM privados de la gente de adentro con el bot.
--
-- El canal "Maven Bot" YA estaba marcado active=false — alguien ya habia intentado ocultarlo —
-- pero eso solo lo saca del selector de canales: ni la RLS ni el query de la bandeja
-- (InboxPage.tsx:219) miraban si el canal estaba prendido. Resultado: 12 conversaciones
-- privadas visibles, entre ellas 217 mensajes de Alvaro con el bot, legibles por 9 personas
-- (los 6 admin + Luis, Test test y Brayan, que tienen has_wa_inbox_global_scope).
-- Y el canal sigue recibiendo pese a estar "apagado": el ultimo mensaje es de hoy.
--
-- No es una fuga hacia afuera: es privacidad entre companeros.
--
-- Se aplica en RLS y no en el front para que tambien desaparezcan de los badges, de las
-- notificaciones y de cualquier otra consulta. Se toca la policy de conversaciones Y la de
-- mensajes: la de mensajes tiene su propio EXISTS sobre wa_conversations, asi que cambiar
-- solo una dejaria los mensajes alcanzables por su propio camino.
--
-- Alcance medido: unico canal inactivo es "Maven Bot" (12 conversaciones, 299 mensajes).
-- Los tres activos — Managers, Unlimited y Unlok — suman 137 conversaciones y 26.701
-- mensajes. Verificado tras aplicar: admin y Operations Sales ven 137 / 26.701.
-- El bot no se entera: whatsapp-ingest escribe con service_role, que no evalua RLS.
--
-- ⚠️ Esto las esconde para TODOS, incluidos los admin y el propio dueno de la conversacion.
-- Es un TAPON. La solucion correcta (que cada quien vea SU DM con el bot) necesita
-- profiles.whatsapp_lid completo: hoy lo tienen 10 de 61 perfiles y NINGUNO de los 10
-- matchea estas 12 conversaciones. De los 12 contactos, solo 5 se pueden identificar por
-- whatsapp_push_name, y los dos mas grandes (Alvaro y Grace) no estan entre esos 5.
-- Para mirarlas mientras tanto, alcanza con reactivar el canal.

alter policy wa_conversations_select on public.wa_conversations
  using (
    (tenant_id = current_tenant_id())
    and exists (select 1 from public.wa_channels ch
                 where ch.id = wa_conversations.channel_id and ch.active)
    and (
      has_wa_inbox_global_scope(auth.uid())
      or (assigned_to = auth.uid())
      or is_wa_assignee(id, auth.uid())
      or wa_supervises_department(auth.uid(), department)
    )
  );

alter policy wa_messages_select on public.wa_conversation_messages
  using (
    (tenant_id = current_tenant_id())
    and exists (
      select 1
      from public.wa_conversations c
      join public.wa_channels ch on ch.id = c.channel_id and ch.active
      where c.id = wa_conversation_messages.conversation_id
        and (
          has_wa_inbox_global_scope(auth.uid())
          or (c.assigned_to = auth.uid())
          or is_wa_assignee(c.id, auth.uid())
          or wa_supervises_department(auth.uid(), c.department)
        )
    )
  );
