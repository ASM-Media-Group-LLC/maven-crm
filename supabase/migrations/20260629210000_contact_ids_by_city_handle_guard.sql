-- Fix: contact_ids_by_city matcheaba contactos con handle VACÍO contra creadoras con handle
-- vacío ('' = '') → falsos positivos (ej. un contacto US salía bajo "Bogotá"). Exigimos handle
-- no-vacío en ambos lados. (contact_filter_cities ya tenía el guard.)
create or replace function public.contact_ids_by_city(p_city text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select cc.id
  from public.closers_contacts cc
  join public.creators cr
    on lower(regexp_replace(coalesce(cr.instagram_handle,''),'^@','')) =
       lower(regexp_replace(coalesce(cc.handle,''),'^@',''))
  where btrim(cr.city) = btrim(p_city)
    and cc.handle is not null and btrim(cc.handle) <> ''
    and cr.instagram_handle is not null and btrim(cr.instagram_handle) <> '';
$$;
