-- Fix: conversaciones huérfanas con channel_id NULL no deben caer en la bandeja del closer.
--
-- Contexto: un mensaje que entra por una instancia que NO es un canal registrado en
-- wa_channels (p.ej. la línea del bot "maven-bot") hace que whatsapp-ingest cree la
-- conversación con channel_id = NULL. Esa huérfana es un caso aparte de la conversación
-- real del contacto (que sí tiene canal). El backfill/trigger de 20260604210000 ("la
-- conversación sigue al dueño del lead") la asignaba igual al closer → "conversación
-- doble" del mismo lead.
--
--   1) Borramos las conversaciones sin canal (huérfanas) y sus mensajes. Hoy es 1:
--      johnlopez.91 vía "maven-bot" (1 mensaje, el "Foco máximo" que era para el grupo
--      del bot). La conversación real del contacto (canal "Closers1", 46 msgs) queda intacta.
--   2) El trigger que sincroniza la conversación con el dueño del lead ahora IGNORA las
--      de channel_id NULL (solo arrastra las de un canal real) → no recurre.

-- 1) Borrar huérfanas (mensajes primero por si el FK no cascada)
delete from public.wa_conversation_messages
 where conversation_id in (select id from public.wa_conversations where channel_id is null);

delete from public.wa_conversations where channel_id is null;

-- 2) Trigger: la conversación sigue al dueño del lead, pero solo si tiene canal real
create or replace function public.wa_sync_conv_on_lead_owner_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
begin
  if new.assigned_to is distinct from old.assigned_to then
    update public.wa_conversations wc
       set assigned_to = new.assigned_to
      from public.wa_contacts ct
     where ct.closer_creator_id = new.id
       and wc.contact_id = ct.id
       and wc.channel_id is not null            -- no arrastrar huérfanas sin canal
       and wc.assigned_to is distinct from new.assigned_to;
  end if;
  return new;
end;
$func$;
