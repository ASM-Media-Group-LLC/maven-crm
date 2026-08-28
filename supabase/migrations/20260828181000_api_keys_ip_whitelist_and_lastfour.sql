-- IP whitelist real (enforced en public-api) + últimos 4 chars para mostrar la
-- key enmascarada en la lista (estilo Infloww: mvk_live_…bvq). Empty = sin
-- restricción de IP.
alter table public.api_keys
  add column if not exists ip_whitelist text[] not null default '{}',
  add column if not exists last_four text;
