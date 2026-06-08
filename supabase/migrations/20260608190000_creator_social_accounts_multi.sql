-- Multi-cuenta de redes sociales por creadora.
--
-- Contexto: una modelo suele tener VARIAS cuentas de IG, pero Maven sólo guardaba
-- una (creators.instagram_handle). Esta tabla guarda las cuentas ADICIONALES; el
-- handle principal sigue viviendo en creators.instagram_handle. El bot de Promolog
-- escanea principal + extras activas, y el webhook mapea cualquier username de
-- vuelta a la misma creadora (la dedup colapsa a 1 fila/creadora/día = "Sí" si
-- promocionó en cualquiera de sus cuentas).
--
-- network se deja genérico ('instagram' por defecto) para soportar otras redes
-- a futuro sin cambiar el esquema.

create table if not exists public.creator_social_accounts (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references public.creators(id) on delete cascade,
  network     text not null default 'instagram',
  username    text not null,
  active      boolean not null default true,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Una creadora no puede tener la misma cuenta repetida en la misma red
-- (case-insensitive sobre el username).
create unique index if not exists creator_social_accounts_uniq
  on public.creator_social_accounts (creator_id, network, lower(username));

create index if not exists idx_csa_creator
  on public.creator_social_accounts (creator_id);

-- El dispatch filtra por (network, active) para saber qué escanear.
create index if not exists idx_csa_network_active
  on public.creator_social_accounts (network, active);

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Espeja el acceso de creators: cualquier usuario autenticado puede VER las
-- cuentas; sólo admin/manager pueden agregar/editar/quitar.
alter table public.creator_social_accounts enable row level security;

drop policy if exists "view creator_social_accounts"   on public.creator_social_accounts;
drop policy if exists "insert creator_social_accounts" on public.creator_social_accounts;
drop policy if exists "update creator_social_accounts" on public.creator_social_accounts;
drop policy if exists "delete creator_social_accounts" on public.creator_social_accounts;

create policy "view creator_social_accounts"
  on public.creator_social_accounts
  for select to authenticated
  using (true);

create policy "insert creator_social_accounts"
  on public.creator_social_accounts
  for insert to authenticated
  with check (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'manager'::app_role));

create policy "update creator_social_accounts"
  on public.creator_social_accounts
  for update to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'manager'::app_role));

create policy "delete creator_social_accounts"
  on public.creator_social_accounts
  for delete to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'manager'::app_role));
