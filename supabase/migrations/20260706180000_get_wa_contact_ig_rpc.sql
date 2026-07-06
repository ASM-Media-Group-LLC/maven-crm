-- Resuelve el @IG del lead a partir del teléfono del contacto de WhatsApp.
-- wa_contacts.instagram_handle está vacío (nunca se pobló); en cambio SÍ tenemos
-- el teléfono (phone_e164) → lo matcheamos (solo dígitos) contra closer_creators
-- (lead) y, si no, creators (creadora firmada), y devolvemos su instagram_handle.
-- SECURITY DEFINER para leer teléfono/IG de los leads pese al masking/RLS; devuelve
-- SOLO el handle de IG (no el teléfono). Prefiere el lead (closer_creators).
create or replace function public.get_wa_contact_ig(p_contact_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  with ph as (
    select regexp_replace(coalesce(phone_e164, ''), '\D', '', 'g') as digits
    from public.wa_contacts where id = p_contact_id
  )
  select ig from (
    select cc.instagram_handle as ig, 1 as pri
    from public.closer_creators cc, ph
    where ph.digits <> ''
      and regexp_replace(coalesce(cc.phone, ''), '\D', '', 'g') = ph.digits
      and coalesce(cc.instagram_handle, '') <> ''
    union all
    select cr.instagram_handle, 2
    from public.creators cr, ph
    where ph.digits <> ''
      and regexp_replace(coalesce(cr.phone, ''), '\D', '', 'g') = ph.digits
      and coalesce(cr.instagram_handle, '') <> ''
  ) t
  order by pri
  limit 1;
$$;

revoke all on function public.get_wa_contact_ig(uuid) from public, anon;
grant execute on function public.get_wa_contact_ig(uuid) to authenticated;
