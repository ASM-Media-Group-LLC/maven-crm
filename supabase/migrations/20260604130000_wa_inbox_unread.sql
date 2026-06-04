-- Inbox: no-leídos (bubbles) — incremento al entrar + reset al abrir.
--
-- Contexto: persistInboxMessage (whatsapp-ingest) seteaba last_message_* pero NO
-- incrementaba unread_count → los bubbles del inbox quedaban siempre en 0. Y como
-- la policy UPDATE de wa_conversations ahora exige el permiso de asignar (candado
-- del slice anterior), el inbox tampoco podía resetear unread_count por update
-- directo. Estos 2 RPCs (SECURITY DEFINER, bypassan RLS) lo resuelven limpio.

-- Incrementa no-leídos + actualiza metadata. Lo llama el ingest (service_role) al
-- persistir un DM ENTRANTE.
create or replace function public.wa_bump_unread(
  p_conversation_id uuid,
  p_preview text,
  p_sent_at timestamptz
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.wa_conversations
  set unread_count = coalesce(unread_count, 0) + 1,
      last_message_at = p_sent_at,
      last_message_preview = p_preview
  where id = p_conversation_id;
$$;
grant execute on function public.wa_bump_unread(uuid, text, timestamptz) to service_role, authenticated;

-- Marca la conversación como leída (resetea no-leídos). Lo llama el inbox al abrir
-- una conversación. Gateado por el permiso de Bandeja (admin incluido).
create or replace function public.wa_mark_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission(auth.uid(), 'WhatsApp', 'Bandeja') then
    raise exception 'Sin permiso de Bandeja.' using errcode = '42501';
  end if;
  update public.wa_conversations
  set unread_count = 0
  where id = p_conversation_id and tenant_id = public.current_tenant_id();
end;
$$;
grant execute on function public.wa_mark_read(uuid) to authenticated;
