-- SOLO ENSAYO LOCAL: esta propuesta NO se aplica a producción. El 24/11 no mostró
-- beneficio consistente en PGlite y el problema de producción ya se había corregido.
-- La última sala propia ya está autorizada por «Participants see own assignment».
-- La otra política evaluaba permisos de anfitrión aun para esas mismas filas.
-- CASE evita esa evaluación repetida, sin cambiar la unión de accesos de SELECT.
-- No modifica INSERT/UPDATE/DELETE ni convierte la RPC en SECURITY DEFINER.
set local lock_timeout = '2s';

do $revisar_politicas$
declare
  _host text;
  _propia text;
begin
  select regexp_replace(qual, '\s', '', 'g') into _host from pg_policies
  where schemaname='public' and tablename='cowork_room_assignments'
    and policyname='Hosts see all assignments' and cmd='SELECT'
    and permissive='PERMISSIVE' and roles=array['authenticated']::name[];
  select regexp_replace(qual, '\s', '', 'g') into _propia from pg_policies
  where schemaname='public' and tablename='cowork_room_assignments'
    and policyname='Participants see own assignment' and cmd='SELECT'
    and permissive='PERMISSIVE' and roles=array['authenticated']::name[];
  if _propia is distinct from '(user_id=(SELECTauth.uid()ASuid))' or
     _host is null or _host not in (
       'is_cowork_host((SELECTauth.uid()ASuid),session_id)',
       'CASEWHEN(user_id=(SELECTauth.uid()ASuid))THENtrueELSEis_cowork_host((SELECTauth.uid()ASuid),session_id)END'
     ) then
    raise exception 'Las políticas de asignaciones cambiaron; revisar su equivalencia antes de optimizar';
  end if;
end
$revisar_politicas$;

alter policy "Hosts see all assignments" on public.cowork_room_assignments
using (case when user_id = (select auth.uid()) then true
       else public.is_cowork_host((select auth.uid()), session_id) end);

-- Permite detener la búsqueda después de la primera asignación del usuario/sesión.
create index if not exists cowork_asignacion_reciente_idx
on public.cowork_room_assignments (user_id, session_id, assigned_at desc);

-- Vuelta de la política, sin borrar el índice ni datos:
--| alter policy "Hosts see all assignments" on public.cowork_room_assignments
--| using (public.is_cowork_host((select auth.uid()), session_id));
