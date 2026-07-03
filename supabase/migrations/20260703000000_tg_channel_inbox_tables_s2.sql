-- S2.1 canal Telegram: tablas de bandeja (espejo de wa_conversations/wa_conversation_messages,
-- pero con identificadores nativos de Telegram: account_id de la línea + peer_id del interlocutor).
-- Ya aplicada en prod vía MCP; este archivo la deja en el repo (idempotente con IF NOT EXISTS).
create table if not exists public.tg_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid default current_tenant_id(),
  account_id text not null,               -- id de la cuenta/línea en el gateway ("main", "acct_xxx")
  peer_id text not null,                  -- id del interlocutor en Telegram (user id / chat id)
  peer_username text,
  peer_name text,
  peer_phone text,                        -- PII (puede venir null)
  contact_id uuid,                        -- link a closers_contacts (se resuelve en S3)
  creator_id uuid,                        -- link a creators (se resuelve en S3)
  status text not null default 'open',
  assigned_to uuid,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count integer not null default 0,
  archived boolean not null default false,
  pinned boolean not null default false,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, peer_id)
);

create table if not exists public.tg_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid default current_tenant_id(),
  conversation_id uuid not null references public.tg_conversations(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  external_id text,                       -- id del mensaje en Telegram (idempotencia)
  sender_id text,                         -- from id (Telegram)
  body text,
  msg_type text not null default 'text',  -- text/photo/document/voice/...
  media_url text,
  status text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (conversation_id, external_id)
);

create index if not exists idx_tg_conversations_last on public.tg_conversations (account_id, last_message_at desc nulls last);
create index if not exists idx_tg_messages_conv on public.tg_messages (conversation_id, sent_at desc nulls last);

-- RLS ON sin políticas para clientes = deny-all salvo service_role (el ingest). La lectura
-- (con visibilidad por dueño + masking de peer_phone) se agrega en S3 vía vista/RPC.
alter table public.tg_conversations enable row level security;
alter table public.tg_messages enable row level security;
