-- Ingesta histórica de Mensajes Pro (QA-D / Slice 2): corpus durable de conversaciones
-- chatter↔fan por modelo, materia prima del borrador IA del QA cualitativo + búsqueda.
-- La llena la edge `chatter-mp-ingest` (un WS por llamada, scoped por modelo, resumible por offset).
-- (Ya aplicada en prod vía MCP el 2026-06-23; este archivo versiona el schema.)
create table if not exists public.chatter_conversations (
  id uuid primary key default gen_random_uuid(),
  model_id bigint not null,
  model_name text,
  chat_id bigint not null,                 -- = fan id (withUser.id)
  fan_name text,
  fan_username text,
  message_id bigint not null,              -- id del mensaje en BLU
  from_me boolean,                         -- true = lado modelo/chatter
  sent_by_chatter_id bigint,               -- sentByManager.id (el chatter que escribió)
  sent_by_chatter_name text,               -- sentByManager.name
  body text,                               -- texto del mensaje (HTML crudo de BLU)
  price numeric,
  is_free boolean,
  is_tip boolean,
  tip_amount numeric,
  media_count int,
  is_opened boolean,
  sent_at timestamptz,                     -- createdAt del mensaje en BLU
  ingested_at timestamptz not null default now(),
  unique (model_id, chat_id, message_id)
);

create index if not exists idx_chatter_conv_model_chat on public.chatter_conversations (model_id, chat_id, sent_at desc);
create index if not exists idx_chatter_conv_chatter on public.chatter_conversations (sent_by_chatter_id) where sent_by_chatter_id is not null;
create index if not exists idx_chatter_conv_sent_at on public.chatter_conversations (sent_at desc);

alter table public.chatter_conversations enable row level security;

-- Solo management; service_role (la edge de ingesta) bypassa RLS.
drop policy if exists chatter_conversations_select on public.chatter_conversations;
create policy chatter_conversations_select on public.chatter_conversations
  for select to authenticated using (public.blu_is_management(auth.uid()));
