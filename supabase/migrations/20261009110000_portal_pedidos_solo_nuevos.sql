-- PORTAL DE CREADORAS · PERSONALIZADOS: SOLO LOS NUEVOS (Jhon, 08/10/2026: «lo de
-- esos personalizados es mejor no tenerlo en cuenta, solo nuevas peticiones»).
-- Banco: supabase/tests/portal_pedidos.ts.
--
-- Los 614 pedidos que había (612 de la hoja, cargados el 02-03/09, y 2 de Maven
-- de septiembre; 61 seguían abiertos) no existen para el portal: ella no los ve
-- (la edge portal-contenido filtra con PEDIDOS_DESDE, la misma fecha) y no le llega
-- ningún aviso si el equipo los mueve. Cuentan los creados desde el 08/10/2026
-- a las 00:00 de Bogotá. El equipo los sigue viendo y trabajando igual.
--
-- Vuelta atrás (las líneas «--|»; el banco las corre):
--| drop trigger if exists custom_requests_avisa_a_la_creadora on public.custom_requests;
--| create trigger custom_requests_avisa_a_la_creadora
--|   after insert or update of status on public.custom_requests
--|   for each row execute function public.custom_requests_avisa_a_la_creadora();
--| drop function if exists public.portal_pedidos_desde();

-- Desde cuándo cuentan. Una función (y no la fecha suelta en cada lugar) para que
-- el banco la compare con la de la edge.
create function public.portal_pedidos_desde()
returns timestamptz
language sql
immutable
set search_path to 'public'
as $$ select timestamptz '2026-10-08 00:00:00-05' $$;

-- El aviso a su campana: solo por los pedidos nuevos.
drop trigger custom_requests_avisa_a_la_creadora on public.custom_requests;
create trigger custom_requests_avisa_a_la_creadora
  after insert or update of status on public.custom_requests
  for each row
  when (new.created_at >= public.portal_pedidos_desde())
  execute function public.custom_requests_avisa_a_la_creadora();
