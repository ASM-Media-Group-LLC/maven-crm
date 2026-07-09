-- promolog_ig_identity — caché del user-id numérico de IG por creadora.
-- La lectura directa de historias (i.instagram.com/api/v1/feed/user/<id>/story/)
-- necesita el user-id, no el handle. El id es PERMANENTE (no cambia aunque
-- renombren el handle), así que se resuelve UNA vez (via actor de perfil o la
-- propia API) y se cachea acá. `promolog-story-read` lo lee/escribe.
create table if not exists public.promolog_ig_identity (
  creator_id uuid primary key references public.creators(id) on delete cascade,
  handle text not null,
  ig_user_id text not null,
  resolved_at timestamptz not null default now()
);
alter table public.promolog_ig_identity enable row level security;
-- lectura para autenticados (auditoría/debug); escritura solo service_role.
drop policy if exists pii_read on public.promolog_ig_identity;
create policy pii_read on public.promolog_ig_identity for select to authenticated using (true);
notify pgrst, 'reload schema';
