-- B: que cada quien vea SU propio DM con el bot, aunque el canal este apagado.
--
-- 20260909190000 escondio los DM privados con el bot para TODOS (tapon). Esto le devuelve
-- a cada persona el suyo, y a nadie mas.
--
-- El requisito es tener el WhatsApp vinculado: profiles.whatsapp_lid guarda el JID COMPLETO
-- (con sufijo @lid o @s.whatsapp.net), que es exactamente lo que hay en wa_contacts.wa_jid.
-- Lo escribe claim_whatsapp_verification_code cuando la persona responde el codigo que le
-- manda el bot desde Settings.
--
-- ⚠️ Al diagnosticar esto compare whatsapp_lid contra split_part(wa_jid,'@',1) y me dio CERO
-- coincidencias, lo que me hizo creer que el vinculado no servia. El error era mio: el lid se
-- guarda CON el sufijo. Comparar jid completo contra jid completo.
--
-- Hoy lo tienen 10 de 61 perfiles, y de las 12 conversaciones del canal "Maven Bot" quedan
-- identificadas 5 (Jhon, Isabel Tuiran, Santiago Valencia, Maria de los Angeles Suarez y
-- Brayan Castano). Alvaro (217 mensajes) y Grace (40) NO aparecen porque no vincularon: en
-- cuanto lo hagan, les aparece la suya sola. Es incremental a proposito.
--
-- El helper toma el CONTACT_ID, no el conversation_id: si leyera wa_conversations, la policy
-- de wa_conversations lo llamaria y se recursaria a si misma.
--
-- Verificado tras aplicar, impersonando: Jhon (vinculado) 138 conversaciones / 26.727 mensajes
-- = los 137 de los canales activos MAS su propio DM de 26 mensajes. Maria de los Angeles
-- (vinculada, Closer +) ve 1 DM del bot, el suyo. Alvaro y Luis (no vinculados) ven 0 DM.
-- Nadie ve el de otro.

create or replace function public.wa_dm_es_mio(_contact_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.wa_contacts ct
    join public.profiles p on lower(p.whatsapp_lid) = lower(ct.wa_jid)
    where ct.id = _contact_id
      and p.id = _user_id
      and p.whatsapp_lid is not null
  );
$function$;

-- Sin este grant las policies tiran "permission denied" para todo el mundo.
grant execute on function public.wa_dm_es_mio(uuid, uuid) to authenticated;

alter policy wa_conversations_select on public.wa_conversations
  using (
    (tenant_id = current_tenant_id())
    and (
      (
        exists (select 1 from public.wa_channels ch
                 where ch.id = wa_conversations.channel_id and ch.active)
        and (
          has_wa_inbox_global_scope(auth.uid())
          or (assigned_to = auth.uid())
          or is_wa_assignee(id, auth.uid())
          or wa_supervises_department(auth.uid(), department)
        )
      )
      or public.wa_dm_es_mio(contact_id, auth.uid())
    )
  );

alter policy wa_messages_select on public.wa_conversation_messages
  using (
    (tenant_id = current_tenant_id())
    and exists (
      select 1
      from public.wa_conversations c
      where c.id = wa_conversation_messages.conversation_id
        and (
          (
            exists (select 1 from public.wa_channels ch
                     where ch.id = c.channel_id and ch.active)
            and (
              has_wa_inbox_global_scope(auth.uid())
              or (c.assigned_to = auth.uid())
              or is_wa_assignee(c.id, auth.uid())
              or wa_supervises_department(auth.uid(), c.department)
            )
          )
          or public.wa_dm_es_mio(c.contact_id, auth.uid())
        )
    )
  );
