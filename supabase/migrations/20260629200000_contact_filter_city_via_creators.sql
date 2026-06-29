-- Corrección del filtro de Ciudad: closers_contacts.city está 100% VACÍO. La ciudad de un
-- contacto = creators.city de la creadora con el MISMO handle (igual que el display, que ya
-- usa ese fallback). Por eso el filtro debe cruzar con creators por handle normalizado.
-- (La versión previa en 20260629190000 leía closers_contacts.city → devolvía 0.)
create or replace function public.contact_filter_cities()
returns setof text language sql stable security definer set search_path = public as $$
  select distinct btrim(cr.city)
  from public.closers_contacts cc
  join public.creators cr
    on lower(regexp_replace(coalesce(cr.instagram_handle,''),'^@','')) =
       lower(regexp_replace(coalesce(cc.handle,''),'^@',''))
  where cr.city is not null and btrim(cr.city) <> ''
    and cc.handle is not null and btrim(cc.handle) <> ''
  order by 1;
$$;

-- ids de contactos cuya creadora (por handle) está en una ciudad dada → el front filtra con .in("id", ids).
create or replace function public.contact_ids_by_city(p_city text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select cc.id
  from public.closers_contacts cc
  join public.creators cr
    on lower(regexp_replace(coalesce(cr.instagram_handle,''),'^@','')) =
       lower(regexp_replace(coalesce(cc.handle,''),'^@',''))
  where btrim(cr.city) = btrim(p_city);
$$;

revoke all on function public.contact_ids_by_city(text) from public, anon;
grant execute on function public.contact_ids_by_city(text) to authenticated;
