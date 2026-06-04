-- Reacción del agente (emoji) a un mensaje del inbox. Refleja en la UI de Maven
-- la reacción que el closer mandó por WhatsApp (la persiste wa-inbox-action).
-- NULL = sin reacción.
alter table public.wa_conversation_messages
  add column if not exists agent_reaction text;
