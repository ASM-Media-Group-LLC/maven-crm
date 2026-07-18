-- FIX: el botón de IG de la bandeja de WhatsApp (PR #822) dejó de aparecer.
--
-- Causa: get_wa_contact_ig matcheaba el teléfono por DÍGITOS COMPLETOS y contra
-- UNA sola columna (phone), pero los teléfonos en Maven vienen locales / sucios /
-- con o sin código de país ("3001234567" vs "573001234567") → el match exacto
-- falla para CO/MX. Es exactamente el problema que resolve_wa_name (#876)
-- resolvió matcheando por ÚLTIMOS 10 DÍGITOS (NSN) y coalesceando las columnas
-- de teléfono. Por eso el NOMBRE sí resuelve y el IG no.
--
-- Se alinea get_wa_contact_ig al mismo matching probado, y se agrega el FK
-- directo (wa_contacts.closer_creator_id) como fuente más fuerte: si la
-- conversación ya está linkeada al lead del pipeline, su @IG es ese, sin
-- ambigüedad de teléfono.
create or replace function public.get_wa_contact_ig(p_contact_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  with ct as (
    select closer_creator_id,
           right(regexp_replace(coalesce(phone_e164, ''), '\D', '', 'g'), 10) as d10
    from public.wa_contacts
    where id = p_contact_id
      -- SECURITY DEFINER bypassa RLS → gateamos a mano igual que wa_contacts_select
      -- (tenant + scope global / conversación asignada o co-asignada) para no
      -- filtrar el @IG de contactos que el caller no puede ver, ni cruzar tenants.
      and tenant_id = public.current_tenant_id()
      and (
        public.has_wa_inbox_global_scope(auth.uid())
        or exists (
          select 1 from public.wa_conversations c
          where c.contact_id = wa_contacts.id
            and (c.assigned_to = auth.uid() or public.is_wa_assignee(c.id, auth.uid()))
        )
      )
  )
  select ig from (
    -- 1) FK directo al lead del pipeline (sin ambigüedad)
    select 1 as pri, cc.instagram_handle as ig
      from ct join public.closer_creators cc on cc.id = ct.closer_creator_id
     where coalesce(cc.instagram_handle, '') <> ''
    union all
    -- 2) lead del pipeline por teléfono (últimos 10 dígitos)
    select 2, cc.instagram_handle
      from ct join public.closer_creators cc
        on length(ct.d10) = 10
       and right(regexp_replace(coalesce(cc.phone, ''), '\D', '', 'g'), 10) = ct.d10
     where coalesce(cc.instagram_handle, '') <> ''
    union all
    -- 3) creadora firmada por teléfono
    select 3, cr.instagram_handle
      from ct join public.creators cr
        on length(ct.d10) = 10
       and right(regexp_replace(coalesce(cr.phone_e164, cr.whatsapp_number, cr.phone, ''), '\D', '', 'g'), 10) = ct.d10
     where coalesce(cr.instagram_handle, '') <> ''
  ) t
  order by pri
  limit 1;
$$;

-- create or replace conserva los grants existentes; se reafirman por idempotencia
-- en ambientes frescos.
revoke all on function public.get_wa_contact_ig(uuid) from public, anon;
grant execute on function public.get_wa_contact_ig(uuid) to authenticated;
