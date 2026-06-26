-- PII admin-only para scouter_leads.phone (patrón "enmascarado, no oculto").
-- Igual que closers_contacts: el front lee una vista que devuelve el phone REAL solo a
-- admins (is_phone_privileged()) y enmascarado al resto; el UPDATE NO se revoca (los
-- scouters pueden registrar/editar un número sin verlo, el front dropea valores con "•").
-- La conversión a contacto se hace server-side (convert_scouter_lead) para leer el phone
-- real sin exponerlo al cliente.
--
-- OJO tenant: a diferencia de closers_contacts (RLS abierta qual=true), scouter_leads
-- tiene RLS de tenant REAL (tenant_id = current_tenant_id()). Una vista definer se salta
-- esa RLS, así que la vista DEBE reponer el filtro de tenant o expondría leads de otros
-- tenants. Mantenemos la vista definer (para que el masking con el column-revoke funcione)
-- + WHERE tenant_id = current_tenant_id().

create or replace view public.v_scouter_leads as
select
  id, company_id, instagram_handle, instagram_url, name, country, city, category,
  status, platform, onlyfans_url, followers, bio, verified, photo_data_url, ai_score,
  ai_status, ai_reason, link_in_bio_platform, prefilter_score, discovery_source,
  contact_account, target_companies, assigned_closer, sub_product, assigned_agency,
  monetization_usd, split_pct, notes, date_added, date_contacted, date_confirmed,
  date_active, date_rejected, contact_touches, created_at, updated_at, tenant_id,
  recent_posts, look_score, phone_first_set_at, first_scouter_contact_at, model_id,
  converted_at, converted_to_contact_id, category_code, lookalike_score,
  lookalike_seed_handle, manual_company_assignment,
  case when public.is_phone_privileged() then phone else public.mask_phone(phone) end as phone
from public.scouter_leads
where tenant_id = public.current_tenant_id();

grant select on public.v_scouter_leads to authenticated;

-- Conversión server-side: lee el phone real para crear el closers_contacts sin que el
-- cliente lo vea. Filtra por tenant (paridad con la RLS que protegía el flujo anterior).
create or replace function public.convert_scouter_lead(p_lead_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_uid uuid := auth.uid(); l public.scouter_leads%rowtype; v_contact uuid;
begin
  if v_uid is null then raise exception 'forbidden' using errcode='42501'; end if;
  select * into l from public.scouter_leads
    where id = p_lead_id and tenant_id = public.current_tenant_id();
  if not found then raise exception 'lead_not_found'; end if;
  insert into public.closers_contacts (name, handle, platform, city, phone, onlyfans_url, profile_picture_url, source, ticket_number, created_by)
  values (coalesce(l.name, l.instagram_handle), l.instagram_handle, coalesce(l.platform,'instagram'), l.city,
          l.phone, l.onlyfans_url, l.photo_data_url, 'scouter', '#SC' || upper(right(l.id::text, 7)), v_uid)
  returning id into v_contact;
  update public.scouter_leads
    set converted_at = now(), converted_to_contact_id = v_contact, status = 'contacting'
    where id = p_lead_id;
  return v_contact;
end; $function$;
revoke all on function public.convert_scouter_lead(uuid) from public, anon;
grant execute on function public.convert_scouter_lead(uuid) to authenticated;

-- REVOKE de la columna phone (se aplica a la DB SOLO DESPUÉS de que el frontend que lee
-- la vista esté deployado, para no romper prod). El grant table-level NO incluye phone;
-- INSERT/UPDATE de phone siguen permitidos (los scouters registran número sin verlo).
revoke select on public.scouter_leads from authenticated, anon;
grant select (
  id, company_id, instagram_handle, instagram_url, name, country, city, category,
  status, platform, onlyfans_url, followers, bio, verified, photo_data_url, ai_score,
  ai_status, ai_reason, link_in_bio_platform, prefilter_score, discovery_source,
  contact_account, target_companies, assigned_closer, sub_product, assigned_agency,
  monetization_usd, split_pct, notes, date_added, date_contacted, date_confirmed,
  date_active, date_rejected, contact_touches, created_at, updated_at, tenant_id,
  recent_posts, look_score, phone_first_set_at, first_scouter_contact_at, model_id,
  converted_at, converted_to_contact_id, category_code, lookalike_score,
  lookalike_seed_handle, manual_company_assignment
) on public.scouter_leads to authenticated;

notify pgrst, 'reload schema';
