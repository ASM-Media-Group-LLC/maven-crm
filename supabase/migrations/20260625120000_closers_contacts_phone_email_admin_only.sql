-- ────────────────────────────────────────────────────────────────────────────
-- Teléfono/email de Contactos: SOLO admin (patrón de oro v_wa_contacts).
-- Antes: closers_contacts.phone/email viajaban crudos al browser de cualquier
-- usuario autenticado (closer, chatter, manager…) aunque la UI los enmascarara
-- → fuga real (DevTools). Ahora: la columna se REVOCA y se lee por una vista
-- enmascarada que solo devuelve phone/email a admin (is_phone_privileged()).
-- Los closers SIGUEN pudiendo mensajear (wa-inbox-open resuelve server-side por
-- contact_id) y convertir (RPC convert_contact_to_creator) sin VER el número.
-- ────────────────────────────────────────────────────────────────────────────

-- 1) Vista enmascarada. Admin/service_role ven phone+email; el resto NULL.
create or replace view public.v_closers_contacts as
select
  id, name, handle, platform, country_code, city, company, status, source,
  ticket_number, notes, physical_appearance, profile_picture_url, media_files,
  assigned_to, created_by, created_at, updated_at, onlyfans_url, record_type,
  phone_first_set_at, model_id, company_id, leadgen_entry_id,
  case when public.is_phone_privileged() then phone else null end as phone,
  case when public.is_phone_privileged() then email else null end as email
from public.closers_contacts;

grant select on public.v_closers_contacts to authenticated;

-- 2) Cerrar la lectura directa de phone/email en la tabla base.
--    OJO: un GRANT a nivel TABLA pisa el REVOKE de columna → primero revoke
--    total del SELECT, luego grant explícito de todas las columnas MENOS phone/email.
revoke select on public.closers_contacts from authenticated;
revoke select on public.closers_contacts from anon;
grant select (
  id, name, handle, platform, country_code, city, company, status, source,
  ticket_number, notes, physical_appearance, profile_picture_url, media_files,
  assigned_to, created_by, created_at, updated_at, onlyfans_url, record_type,
  phone_first_set_at, model_id, company_id, leadgen_entry_id
) on public.closers_contacts to authenticated;

-- 3) Convertir contacto→creadora SERVER-SIDE: lee el phone/email reales sin
--    exponerlos al cliente (un closer convierte sin ver el número).
create or replace function public.convert_contact_to_creator(p_contact_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c   public.closers_contacts%rowtype;
  v_new uuid;
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_c from public.closers_contacts where id = p_contact_id;
  if not found then
    raise exception 'contact_not_found';
  end if;
  if v_c.handle is null or btrim(v_c.handle) = '' then
    raise exception 'missing_handle';
  end if;

  insert into public.creators (
    name, instagram_handle, country, category, phone, country_code, email,
    profile_photo_url, source, status, internal_notes, created_by
  ) values (
    v_c.name, v_c.handle, v_c.country_code, v_c.physical_appearance, v_c.phone,
    v_c.country_code, v_c.email, v_c.profile_picture_url, 'contacto', 'pendiente',
    case when v_c.company is not null then 'Compañía: ' || v_c.company else null end,
    v_uid
  ) returning id into v_new;

  update public.closers_contacts set status = 'converted' where id = p_contact_id;
  return v_new;
end;
$$;

revoke all on function public.convert_contact_to_creator(uuid) from public, anon;
grant execute on function public.convert_contact_to_creator(uuid) to authenticated;

notify pgrst, 'reload schema';
