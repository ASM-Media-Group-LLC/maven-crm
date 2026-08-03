-- Proyectos de Hubstaff en los que fichó cada persona dentro de un rango.
--
-- ⚠️ POR QUÉ UN RPC Y NO UN SELECT DESDE LA TOOL: hubstaff_activities tiene ~700
-- filas POR DÍA. Con el rango por defecto de la tool (7 días) son ~5.000, y
-- PostgREST corta en 1000 SIN AVISAR: los que quedaran fuera del corte saldrían
-- como "sin proyecto" y el filtro de chatters los perdería. Agregar acá devuelve
-- una fila por (persona, proyecto) — decenas, no miles.
--
-- El proyecto es lo ÚNICO que dice el puesto DENTRO de Hubstaff: hubstaff_role es
-- user/manager/owner (permisos), y 24 de 63 miembros activos no tienen cuenta en
-- Maven, así que el rol de Maven no puede suplirlo.
create or replace function public.hubstaff_projects_by_member(
  p_from date,
  p_to   date
)
returns table (hubstaff_user_id text, project_name text, tracked_seconds bigint)
language sql
stable
security definer
set search_path = public
as $$
  select hm.hubstaff_user_id,
         a.project_name,
         sum(a.tracked_seconds)::bigint
  from hubstaff_activities a
  join hubstaff_members hm on hm.id = a.member_id
  where a.project_name is not null
    -- Rango en hora de Bogotá (UTC-5): el turno de madrugada cruza medianoche UTC
    -- y con el corte en UTC se caía del día que le corresponde.
    and a.starts_at >= (p_from::timestamp + interval '5 hours')
    and a.starts_at <  ((p_to + 1)::timestamp + interval '5 hours')
  group by 1, 2;
$$;

comment on function public.hubstaff_projects_by_member(date, date) is
  'Proyectos de Hubstaff por persona en un rango (hora Bogotá). Agrega en la base para no chocar con el límite de 1000 filas de PostgREST, que truncaba en silencio y hacía aparecer gente "sin proyecto".';

revoke all on function public.hubstaff_projects_by_member(date, date) from public;
grant execute on function public.hubstaff_projects_by_member(date, date) to authenticated, service_role;
