-- Paridad de mensajería Telegram (bandeja) — columnas para interacciones.
-- Espejo de wa_conversation_messages: citar/responder, reaccionar (emoji del agente) y
-- borrado suave. La escritura la hacen los edges con service_role (RLS deny-all de escritura
-- para clientes sigue igual); la lectura ya está habilitada por la vista/policy de S3.
alter table public.tg_messages
  add column if not exists reply_to_message_id uuid references public.tg_messages(id) on delete set null,
  add column if not exists reply_to_external_id text,   -- id nativo del mensaje citado (para replyTo del gateway)
  add column if not exists reaction text,                -- reacción del agente (emoji), como wa.agent_reaction
  add column if not exists deleted_at timestamptz;       -- borrado suave (revoke en Telegram)

create index if not exists idx_tg_messages_reply on public.tg_messages(reply_to_message_id);
