-- Remediación PII (audit) — creator_prospects (C3/C4). Patrón enmascarado+editable.
-- La vista v_creator_prospects ya enmascara phone/email (migración 20260625170000).
-- Acá: RPC de onboarding server-side (lee phone/email reales sin exponerlos) + REVOKE de columnas.
-- El frontend (PR #687) ya lee de la vista y onboarda por el RPC ANTES de este revoke.

create or replace function public.start_prospect_onboarding(p_prospect_id uuid, p_agency text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); p public.creator_prospects%rowtype; v_company_id uuid;
begin
  if v_uid is null then raise exception 'forbidden' using errcode='42501'; end if;
  select * into p from public.creator_prospects where id = p_prospect_id;
  if not found then raise exception 'prospect_not_found'; end if;
  insert into public.creators (id, name, email, phone, country, instagram_handle, tiktok_handle, category, status, created_at, created_by)
  values (p.id, p.name, p.email, p.phone, p.country, p.instagram, p.tiktok, p.category, 'borrador', p.created_at, v_uid);
  select id into v_company_id from public.scouter_companies where name ilike p_agency limit 1;
  insert into public.creator_business (creator_id, assigned_agency, company_id) values (p.id, p_agency, v_company_id);
  update public.creator_prospects set status = 'convertido' where id = p.id;
  return p.id;
end; $$;
revoke all on function public.start_prospect_onboarding(uuid, text) from public, anon;
grant execute on function public.start_prospect_onboarding(uuid, text) to authenticated;

-- REVOKE columnas PII (aplicar en prod DESPUÉS del deploy del frontend)
revoke select on public.creator_prospects from authenticated, anon;
grant select (id, name, instagram, tiktok, platform, category, agency, country, source, status, notes, created_by, created_at, updated_at)
  on public.creator_prospects to authenticated;
notify pgrst, 'reload schema';
