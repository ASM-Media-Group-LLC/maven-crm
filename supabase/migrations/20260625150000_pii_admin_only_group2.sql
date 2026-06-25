-- ────────────────────────────────────────────────────────────────────────────
-- Remediación PII (audit 2026-06-25), grupo contenido (sin mensajería). Patrón de oro
-- (vista enmascarada + REVOKE columna; is_phone_privileged() = admin OR service_role).
-- Cierra C5/C6 (super_contacts), C9/C10 (event_guests), C13/C14 (agencies).
-- creator_prospects (C3/C4) queda DIFERIDO: su onboarding convierte leyendo phone/email
-- → necesita RPC server-side (se hace junto con scouter_leads/creators).
-- El frontend ya lee de las vistas / columnas explícitas (PRs #680) ANTES de este revoke.
-- ────────────────────────────────────────────────────────────────────────────

-- Vistas enmascaradas (v_creator_prospects se crea para el próximo slice; aún no se revoca su tabla)
create or replace view public.v_agencies as
select id, name, contact_name, website, country_code, status, notes, created_by, created_at, updated_at,
  case when public.is_phone_privileged() then phone else null end as phone,
  case when public.is_phone_privileged() then email else null end as email
from public.agencies;
grant select on public.v_agencies to authenticated;

create or replace view public.v_super_contacts as
select id, instagram_handle, full_name, profile_photo_url, followers_count, bio, category, country, city,
  notes, status, enriched, created_by, created_at, updated_at, check_frequency, last_checked_at,
  case when public.is_phone_privileged() then phone else null end as phone,
  case when public.is_phone_privileged() then email else null end as email
from public.super_contacts;
grant select on public.v_super_contacts to authenticated;

create or replace view public.v_creator_prospects as
select id, name, instagram, tiktok, platform, category, agency, country, source, status, notes, created_by, created_at, updated_at,
  case when public.is_phone_privileged() then phone else null end as phone,
  case when public.is_phone_privileged() then email else null end as email
from public.creator_prospects;
grant select on public.v_creator_prospects to authenticated;

-- REVOKE columnas PII (tabla-level grant pisa column-revoke → revoke total + grant no-PII)
revoke select on public.agencies from authenticated, anon;
grant select (id, name, contact_name, website, country_code, status, notes, created_by, created_at, updated_at)
  on public.agencies to authenticated;

revoke select on public.super_contacts from authenticated, anon;
grant select (id, instagram_handle, full_name, profile_photo_url, followers_count, bio, category, country, city,
  notes, status, enriched, created_by, created_at, updated_at, check_frequency, last_checked_at)
  on public.super_contacts to authenticated;

revoke select on public.event_guests from authenticated, anon;
grant select (id, event_id, creator_id, guest_name, guest_type, status, created_at, cancellation_reason, status_updated_at, status_changed_by)
  on public.event_guests to authenticated;

notify pgrst, 'reload schema';