-- Opciones de filtro (Ciudad / Agente) a nivel DATASET COMPLETO para Contactos.
-- Antes se derivaban de la página paginada (los ~25 visibles) y el filtrado era client-side
-- sobre esa página → los filtros solo afectaban lo visible. Estos RPCs devuelven el universo
-- real para que el frontend filtre server-side. closers_contacts tiene RLS abierta (qual=true)
-- → definer no cambia el alcance; solo authenticated.
create or replace function public.contact_filter_cities()
returns setof text language sql stable security definer set search_path = public as $$
  select distinct btrim(city)
  from public.closers_contacts
  where city is not null and btrim(city) <> ''
  order by 1;
$$;

create or replace function public.contact_filter_agents()
returns table(id uuid, name text) language sql stable security definer set search_path = public as $$
  select c.created_by, max(p.full_name)
  from public.closers_contacts c
  join public.profiles p on p.id = c.created_by
  where c.created_by is not null
  group by c.created_by
  having max(p.full_name) is not null and btrim(max(p.full_name)) <> ''
  order by 2;
$$;

revoke all on function public.contact_filter_cities() from public, anon;
revoke all on function public.contact_filter_agents() from public, anon;
grant execute on function public.contact_filter_cities() to authenticated;
grant execute on function public.contact_filter_agents() to authenticated;
