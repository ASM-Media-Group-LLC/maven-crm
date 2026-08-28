-- API keys para la API pública de Maven (Fase 1: creadoras + redes).
-- Gestión SOLO-admin vía edge manage-api-keys; validación en edge public-api.
-- El secreto se guarda solo como hash SHA-256; se muestra una única vez al crear.
create table if not exists public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  key_prefix    text not null,               -- parte pública para identificar (ej. "mvk_live_a1b2c3")
  key_hash      text not null unique,         -- sha256 hex del secreto completo
  scopes        text[] not null default '{}', -- ej. {creators:read}
  created_by    uuid references auth.users(id) on delete set null,
  created_by_email text,                      -- denormalizado (profiles no tiene email)
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  request_count bigint not null default 0,
  expires_at    timestamptz,                  -- null = no expira
  revoked_at    timestamptz,                  -- null = activa
  revoked_by    uuid references auth.users(id) on delete set null
);

comment on table public.api_keys is 'API keys para la API pública de Maven. Gestion solo-admin. Secreto guardado como hash SHA-256.';

-- Lookup por hash en cada request de la API pública.
create index if not exists api_keys_key_hash_idx on public.api_keys (key_hash);

-- RLS: bloqueada para todo cliente. Todo acceso pasa por edges con service_role
-- (manage-api-keys para gestion admin, public-api para validacion). Nunca se
-- expone el hash ni el secreto al browser.
alter table public.api_keys enable row level security;
revoke all on public.api_keys from anon, authenticated;
