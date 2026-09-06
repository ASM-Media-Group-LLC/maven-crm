-- Push a quien le asignan una conversación de la bandeja (WhatsApp y Telegram),
-- SOLO cuando lo asigna otra persona a mano. Decisión de Jhon (06/09/2026): las
-- autoasignaciones no avisan — whatsapp-ingest (default_assignees) y
-- wa-inbox-open (quien abre la conversación) insertan sin assigned_by, y la
-- autoasignación manual trae assigned_by = user_id. Si un día se quiere avisar
-- de cada WhatsApp nuevo que entra, va como kind aparte, porque es mucho más
-- ruidoso.
--
-- Requiere la versión DELTA de *_conversation_set_assignees (migración
-- anterior): con el DELETE+INSERT viejo, reasignar el set re-disparaba este
-- trigger para quien ya estaba.
--
-- El cuerpo lleva el nombre del contacto; si no hay, NO se pone el número: en
-- la app el teléfono se muestra por permiso (can_see_contact_phone) y un push
-- no puede saltárselo.
create or replace function public.push_wa_asignacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien text;
begin
  if new.assigned_by is null or new.assigned_by = new.user_id then
    return null;
  end if;

  select nullif(c.display_name, '') into v_quien
  from wa_conversations wc
  join wa_contacts c on c.id = wc.contact_id
  where wc.id = new.conversation_id;

  perform public.push_notify_enqueue(
    'inbox_asignacion',
    array[new.user_id],
    jsonb_build_object('conversation_id', new.conversation_id, 'assigned_by', new.assigned_by, 'channel', 'wa'),
    'Te asignaron una conversación',
    coalesce(v_quien, 'Un contacto de WhatsApp'),
    '/inbox?c=' || new.conversation_id,
    'inbox-' || new.conversation_id,
    'normal'
  );
  return null;
end
$$;

revoke all on function public.push_wa_asignacion() from public, anon, authenticated;

drop trigger if exists on_wa_assignee_push on public.wa_conversation_assignees;
create trigger on_wa_assignee_push
  after insert on public.wa_conversation_assignees
  for each row execute function public.push_wa_asignacion();

create or replace function public.push_tg_asignacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien text;
begin
  if new.assigned_by is null or new.assigned_by = new.user_id then
    return null;
  end if;

  select coalesce(nullif(t.peer_name, ''), nullif('@' || t.peer_username, '@')) into v_quien
  from tg_conversations t
  where t.id = new.conversation_id;

  perform public.push_notify_enqueue(
    'inbox_asignacion',
    array[new.user_id],
    jsonb_build_object('conversation_id', new.conversation_id, 'assigned_by', new.assigned_by, 'channel', 'tg'),
    'Te asignaron una conversación',
    coalesce(v_quien, 'Un contacto de Telegram'),
    '/telegram/bandeja?c=' || new.conversation_id,
    'inbox-tg-' || new.conversation_id,
    'normal'
  );
  return null;
end
$$;

revoke all on function public.push_tg_asignacion() from public, anon, authenticated;

drop trigger if exists on_tg_assignee_push on public.tg_conversation_assignees;
create trigger on_tg_assignee_push
  after insert on public.tg_conversation_assignees
  for each row execute function public.push_tg_asignacion();
