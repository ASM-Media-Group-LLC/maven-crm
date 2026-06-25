-- Feedback del owner: NO ocultar phone/email a no-admin; mostrarlos ENMASCARADOS (••••<4 últimos>)
-- pero permitir registrar/cambiar un número/correo nuevo. Las vistas pasan de devolver NULL a
-- devolver el valor enmascarado para no-admin. El enmascarado tiene solo 4 dígitos → NO sirve para
-- mensajear (sin riesgo); el envío va server-side por contact_id. El form escribe solo si el valor
-- NUEVO no trae "•" (si lo dejan enmascarado, no se pisa el real). UPDATE no está revocado → el
-- no-admin puede registrar/cambiar sin VER el número completo.

create or replace function public.mask_email(p text)
returns text language sql immutable as $$
  select case
    when p is null then null
    when position('@' in p) = 0 then repeat(chr(8226), 4)
    else left(p, 1) || repeat(chr(8226), 3) || substring(p from position('@' in p))
  end
$$;

create or replace view public.v_closers_contacts as
select
  id, name, handle, platform, country_code, city, company, status, source,
  ticket_number, notes, physical_appearance, profile_picture_url, media_files,
  assigned_to, created_by, created_at, updated_at, onlyfans_url, record_type,
  phone_first_set_at, model_id, company_id, leadgen_entry_id,
  case when public.is_phone_privileged() then phone else public.mask_phone(phone) end as phone,
  case when public.is_phone_privileged() then email else public.mask_email(email) end as email
from public.closers_contacts;

create or replace view public.v_super_contacts as
select id, instagram_handle, full_name, profile_photo_url, followers_count, bio, category, country, city,
  notes, status, enriched, created_by, created_at, updated_at, check_frequency, last_checked_at,
  case when public.is_phone_privileged() then phone else public.mask_phone(phone) end as phone,
  case when public.is_phone_privileged() then email else public.mask_email(email) end as email
from public.super_contacts;

create or replace view public.v_agencies as
select id, name, contact_name, website, country_code, status, notes, created_by, created_at, updated_at,
  case when public.is_phone_privileged() then phone else public.mask_phone(phone) end as phone,
  case when public.is_phone_privileged() then email else public.mask_email(email) end as email
from public.agencies;

create or replace view public.v_creator_prospects as
select id, name, instagram, tiktok, platform, category, agency, country, source, status, notes, created_by, created_at, updated_at,
  case when public.is_phone_privileged() then phone else public.mask_phone(phone) end as phone,
  case when public.is_phone_privileged() then email else public.mask_email(email) end as email
from public.creator_prospects;

notify pgrst, 'reload schema';
