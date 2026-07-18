-- =============================================================================
-- Contactos: teléfono visible por PERMISO de UI ("Contactos / Ver Teléfonos").
-- -----------------------------------------------------------------------------
-- Pedido del owner: que el rol "Closer Supervisor" (y cualquier rol al que un
-- admin le prenda el toggle) pueda VER el número de teléfono de los CONTACTOS
-- (closers_contacts), manteniendo el de CREADORES (v_creators) admin-only.
--
-- Diseño (server-side, la UI solo refleja):
--   * Nuevo predicado can_see_contact_phone(): privilegiado (admin/service_role,
--     vía is_phone_privileged) O el rol tiene EXPLÍCITAMENTE marcado el permiso
--     'Contactos'/'Ver Teléfonos' en role_permissions.
--   * v_closers_contacts.phone deja de enmascararse para quien pase ese predicado.
--     El EMAIL sigue admin-only (is_phone_privileged) — solo se pidió el teléfono.
--
-- ⚠️ A propósito NO usamos has_permission(): su fallback `bool_or(cualquier
--    submódulo)` haría que un rol con acceso a CUALQUIER parte de Contactos
--    filtrara el teléfono. Acá exigimos la fila EXPLÍCITA (default-deny), que es
--    la que togglea el admin en el modal de permisos.
--
-- Additive + reversible. NO toca is_phone_privileged (compartido por todas las
-- vistas PII: super_contacts/agencies/creator_prospects/creators) ni v_creators.
-- =============================================================================

-- ¿El usuario actual puede ver el teléfono COMPLETO de los contactos?
create or replace function public.can_see_contact_phone()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_phone_privileged()
    or exists (
      select 1
      from public.user_roles ur
      join public.roles_config rc
        on rc.name = ur.role and rc.is_active
      join public.role_permissions rp
        on rp.role_id = rc.id
      where ur.user_id = auth.uid()
        and rp.module = 'Contactos'
        and rp.submodule = 'Ver Teléfonos'
        and rp.can_access = true
    );
$$;
comment on function public.can_see_contact_phone() is
  'TRUE si el user es privilegiado (admin/service_role vía is_phone_privileged) O su rol tiene el permiso EXPLÍCITO Contactos/Ver Teléfonos. Default-deny (no usa el fallback bool_or de has_permission). Gate del teléfono en v_closers_contacts.';

-- Redefinición de v_closers_contacts: mismas 25 columnas que la vigente
-- (20260625170000), pero el teléfono ahora usa can_see_contact_phone(). El email
-- se mantiene admin-only. create or replace view preserva los GRANTs existentes
-- → no tocamos privilegios (no romper al bot/service_role).
create or replace view public.v_closers_contacts as
select
  id, name, handle, platform, country_code, city, company, status, source,
  ticket_number, notes, physical_appearance, profile_picture_url, media_files,
  assigned_to, created_by, created_at, updated_at, onlyfans_url, record_type,
  phone_first_set_at, model_id, company_id, leadgen_entry_id,
  case when public.can_see_contact_phone() then phone else public.mask_phone(phone) end as phone,
  case when public.is_phone_privileged() then email else public.mask_email(email) end as email
from public.closers_contacts;

-- Seed: prender "Ver Teléfonos" para el rol Closer Supervisor (único que se pidió
-- de entrada). Idempotente: si ya existe la fila, la prende; si no, la inserta.
update public.role_permissions rp
set can_access = true
from public.roles_config rc
where rc.id = rp.role_id
  and rc.name = 'Closer Supervisor' and rc.is_active
  and rp.module = 'Contactos' and rp.submodule = 'Ver Teléfonos';

insert into public.role_permissions (role_id, module, submodule, can_access, data_scope)
select rc.id, 'Contactos', 'Ver Teléfonos', true, 'all'
from public.roles_config rc
where rc.name = 'Closer Supervisor' and rc.is_active
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = rc.id
      and rp.module = 'Contactos' and rp.submodule = 'Ver Teléfonos'
  );

notify pgrst, 'reload schema';
