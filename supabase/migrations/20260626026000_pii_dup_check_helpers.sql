-- Dedup helpers para los formularios de alta de Contacto/Creadora. Leen phone/email
-- SERVER-SIDE (las columnas están revocadas para no-admin) y devuelven SOLO el nombre del
-- match (nunca el número/email) → restauran el aviso "ya registrado" sin exponer PII.
-- Authenticated-only (no anon: evita enumeración reverse-lookup desde afuera).
create or replace function public.find_contact_name_by_phone(p_phone text)
returns text language sql stable security definer set search_path = public as $$
  select name from public.closers_contacts where phone = p_phone limit 1;
$$;

create or replace function public.find_creator_name_by_phone(p_phone text)
returns text language sql stable security definer set search_path = public as $$
  select name from public.creators where phone = p_phone limit 1;
$$;

create or replace function public.find_creator_name_by_email(p_email text)
returns text language sql stable security definer set search_path = public as $$
  select name from public.creators where email ilike btrim(p_email) limit 1;
$$;

revoke all on function public.find_contact_name_by_phone(text) from public, anon;
revoke all on function public.find_creator_name_by_phone(text) from public, anon;
revoke all on function public.find_creator_name_by_email(text) from public, anon;
grant execute on function public.find_contact_name_by_phone(text) to authenticated;
grant execute on function public.find_creator_name_by_phone(text) to authenticated;
grant execute on function public.find_creator_name_by_email(text) to authenticated;
