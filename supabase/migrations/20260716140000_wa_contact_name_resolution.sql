-- Resolución de NOMBRES de contactos de WhatsApp (bandeja) contra Maven.
--
-- Problema: wa_contacts.display_name = push-name de WhatsApp (lo que el otro se
-- puso: "K A S H agency", "DM🦋") o null → la bandeja mostraba nombres inútiles
-- o "(sin nombre)" aunque Maven SÍ conoce a esa persona (creadora/contacto).
-- Además el "renombrar" no persistía: wa_contacts tiene RLS con solo policy
-- SELECT (sin UPDATE) → el UPDATE del front tocaba 0 filas SIN error.
--
-- Solución (no destructiva):
--   * manual_name  → rename manual del usuario (autoritativo). Se escribe SOLO
--                    vía RPC wa_set_contact_display_name (SECURITY DEFINER).
--   * resolved_name→ nombre canónico de Maven, cacheado. Lo mantiene un trigger
--                    (+ backfill inicial) cruzando el teléfono contra el pipeline.
--   * display_name → se deja como está (push-name), como último fallback.
-- Prioridad de display (front): manual_name > resolved_name > display_name > @ig.

-- ── Columnas ────────────────────────────────────────────────────────────────
alter table public.wa_contacts add column if not exists manual_name text;
alter table public.wa_contacts add column if not exists resolved_name text;
alter table public.wa_contacts add column if not exists resolved_name_source text;

-- El front lee la tabla directo por grants de columna (phone_e164 está revocado
-- por PII). Exponemos las columnas nuevas de nombre (NO el teléfono).
grant select (manual_name, resolved_name, resolved_name_source)
  on public.wa_contacts to authenticated;

-- ── Resolver CORE: por (closer_creator_id, teléfono crudo) ──────────────────
-- Match por ÚLTIMOS 10 DÍGITOS (NSN): los teléfonos en Maven vienen locales /
-- sucios / con doble código de país, mientras wa_contacts.phone_e164 está limpio.
-- Comparar dígitos exactos falla para CO/MX; los últimos 10 lo resuelven.
-- SECURITY DEFINER: lee teléfono/nombre bajo masking/RLS; devuelve SOLO el nombre.
create or replace function public.resolve_wa_name(p_closer_creator_id uuid, p_phone text)
returns table(name text, source text, entity_id text)
language sql stable security definer set search_path = public as $$
  with t as (
    select p_closer_creator_id as ccid,
           right(regexp_replace(coalesce(p_phone,''),'\D','','g'),10) as d10
  ),
  cand as (
    -- 1) FK directo (la entidad de la que trata la conversación; sin ambigüedad)
    select 1 pri, 'pipeline_link'::text source, cc.id::text entity_id,
           coalesce(nullif(btrim(co.name),''), nullif(btrim(mo.display_name),''), cc.instagram_handle) name
      from t join public.closer_creators cc on cc.id = t.ccid
      left join public.closers_contacts co on co.id = cc.source_contact_id
      left join public.models mo on mo.id = cc.model_id
      where coalesce(nullif(btrim(co.name),''), nullif(btrim(mo.display_name),''), cc.instagram_handle) is not null
    union all
    -- 2) creadora firmada por teléfono
    select 2, 'creator', cr.id::text, cr.name from t join public.creators cr
      on length(t.d10) = 10
     and right(regexp_replace(coalesce(cr.phone_e164, cr.whatsapp_number, cr.phone, ''),'\D','','g'),10) = t.d10
      where nullif(btrim(cr.name),'') is not null
    union all
    -- 3) contacto del pipeline por teléfono (country_code va aparte de phone)
    select 3, 'closers_contact', co.id::text, co.name from t join public.closers_contacts co
      on length(t.d10) = 10
     and right(regexp_replace(coalesce(co.country_code,'') || coalesce(co.phone,''),'\D','','g'),10) = t.d10
      where nullif(btrim(co.name),'') is not null
    union all
    -- 4) closer_creators por teléfono (sin FK) → nombre vinculado / @ig
    select 4, 'pipeline_phone', cc.id::text,
           coalesce(nullif(btrim(co.name),''), nullif(btrim(mo.display_name),''), cc.instagram_handle)
      from t join public.closer_creators cc
        on length(t.d10) = 10 and right(regexp_replace(coalesce(cc.phone,''),'\D','','g'),10) = t.d10
      left join public.closers_contacts co on co.id = cc.source_contact_id
      left join public.models mo on mo.id = cc.model_id
      where coalesce(nullif(btrim(co.name),''), nullif(btrim(mo.display_name),''), cc.instagram_handle) is not null
    union all
    -- 5) lead de scouting por teléfono
    select 5, 'scouter_lead', sl.id::text, sl.name from t join public.scouter_leads sl
      on length(t.d10) = 10 and right(regexp_replace(coalesce(sl.phone,''),'\D','','g'),10) = t.d10
      where nullif(btrim(sl.name),'') is not null
    union all
    -- 6) staff (perfiles internos)
    select 6, 'staff', p.id::text, p.full_name from t join public.profiles p
      on length(t.d10) = 10 and right(regexp_replace(coalesce(p.phone_e164,''),'\D','','g'),10) = t.d10
      where nullif(btrim(p.full_name),'') is not null
  )
  select name, source, entity_id from cand order by pri limit 1;
$$;

-- ── Resolver por contact_id (conveniencia para bots/tools) ──────────────────
create or replace function public.resolve_wa_name(p_contact_id uuid)
returns table(name text, source text, entity_id text)
language sql stable security definer set search_path = public as $$
  select r.name, r.source, r.entity_id
  from public.wa_contacts ct
  cross join lateral public.resolve_wa_name(ct.closer_creator_id, ct.phone_e164) r
  where ct.id = p_contact_id;
$$;

grant execute on function public.resolve_wa_name(uuid, text) to authenticated, service_role;
grant execute on function public.resolve_wa_name(uuid) to authenticated, service_role;

-- ── Trigger: mantener resolved_name fresco ──────────────────────────────────
create or replace function public.wa_contacts_set_resolved_name()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select name, source into r
    from public.resolve_wa_name(new.closer_creator_id, new.phone_e164) limit 1;
  new.resolved_name := r.name;             -- null si no resuelve (queda el push-name como fallback)
  new.resolved_name_source := r.source;
  return new;
end;
$$;

drop trigger if exists trg_wa_contacts_resolved_name on public.wa_contacts;
create trigger trg_wa_contacts_resolved_name
  before insert or update of closer_creator_id, phone_e164 on public.wa_contacts
  for each row execute function public.wa_contacts_set_resolved_name();

-- ── Backfill de los contactos existentes ────────────────────────────────────
-- Un no-op update sobre una columna del trigger (phone_e164) lo dispara para
-- todas las filas → resolved_name queda poblado sin ambigüedad de lateral.
update public.wa_contacts set phone_e164 = phone_e164;

-- ── RPC para renombrar (persistente) ────────────────────────────────────────
-- wa_contacts no tiene policy UPDATE → hay que escribir vía SECURITY DEFINER.
-- Gate = misma visibilidad que el SELECT (global scope o conversación asignada).
-- Escribe manual_name (el rename manual gana sobre lo auto-resuelto).
create or replace function public.wa_set_contact_display_name(p_contact_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_allowed boolean; v_id uuid;
begin
  select (ct.tenant_id = current_tenant_id())
     and (has_wa_inbox_global_scope(auth.uid())
          or exists (select 1 from public.wa_conversations c
                     where c.contact_id = p_contact_id and c.assigned_to = auth.uid()))
    into v_allowed
  from public.wa_contacts ct where ct.id = p_contact_id;

  if not coalesce(v_allowed, false) then
    raise exception 'not_authorized_or_not_found' using errcode = '42501';
  end if;

  update public.wa_contacts
     set manual_name = nullif(btrim(p_name), ''), updated_at = now()
   where id = p_contact_id
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.wa_set_contact_display_name(uuid, text) to authenticated;

notify pgrst, 'reload schema';
