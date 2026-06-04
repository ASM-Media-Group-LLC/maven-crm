-- Responder/citar: referencia al mensaje original citado (mismo hilo).
-- NULL = no es una respuesta. Self-FK con ON DELETE SET NULL para no romper el
-- hilo si el mensaje citado se elimina.
alter table public.wa_conversation_messages
  add column if not exists reply_to_message_id uuid
    references public.wa_conversation_messages(id) on delete set null;
