-- Traspaso del trabajo ABIERTO de Miguel García a María Suárez (pedido de Jhon 28/08).
--
-- SOLO lo abierto. Las 214 filas cerradas (No interesada / Completada / Rechazada) se
-- quedan con Miguel: reescribir el historial haría que sus 190 "no interesada"
-- aparezcan como trabajo de María y le distorsione las métricas y la nota del cierre.
-- Quién hizo qué es un hecho, no una asignación.
--
-- ⚠️ Se apaga el trigger de notificación adrede: notify_closer_on_assignment dispara
-- UNA notificación por lead con "primer contacto en 1 día", y dedupea por par
-- (lead, usuario), no por lote. Sin esto María recibe 38 de golpe.
alter table public.closer_creators disable trigger on_closer_creator_assigned;

update public.closer_creators
   set assigned_to = '91933cea-c9bd-4013-94ba-308053c3d52a'
 where assigned_to = 'e54ccc2a-ee51-4f9d-bc1d-7e981a015f5c'
   and stage in ('Asignada','Confirmada');

alter table public.closer_creators enable trigger on_closer_creator_assigned;

update public.monetization_opportunities
   set assigned_to = '91933cea-c9bd-4013-94ba-308053c3d52a'
 where assigned_to = 'e54ccc2a-ee51-4f9d-bc1d-7e981a015f5c'
   and stage in ('interested','offered','negotiating');

-- team_agenda_items.owner_user_id está 100% NULL en esta base: la atribución real es
-- owner_name en texto libre, así que hay que tocar ese.
update public.team_agenda_items
   set owner_name = 'María'
 where status = 'pending' and owner_name ilike '%miguel%';

-- Conversaciones de WhatsApp: a mano, porque el trigger no lo hacía (se arregla en la
-- migración siguiente). Sin esto quedaban 124 conversaciones que nadie podía ver.
delete from public.wa_conversation_assignees a
 where a.user_id = 'e54ccc2a-ee51-4f9d-bc1d-7e981a015f5c'
   and exists (select 1 from public.wa_conversation_assignees b
                where b.conversation_id = a.conversation_id
                  and b.user_id = '91933cea-c9bd-4013-94ba-308053c3d52a');

update public.wa_conversation_assignees
   set user_id = '91933cea-c9bd-4013-94ba-308053c3d52a'
 where user_id = 'e54ccc2a-ee51-4f9d-bc1d-7e981a015f5c';

update public.wa_conversations
   set assigned_to = '91933cea-c9bd-4013-94ba-308053c3d52a'
 where assigned_to = 'e54ccc2a-ee51-4f9d-bc1d-7e981a015f5c';
