-- promolog_ig_scan_state_today — estado del scan de IG de HOY por creadora, para que
-- promolog-scan-targets pueda ordenar: nunca-escaneada primero, pendiente después,
-- definitiva (Sí/No) al final. Así cada corrida parcial de la extensión ataca la cola
-- que se muere de hambre en vez de re-leer siempre el principio de la lista.
--
-- "definitiva" = promoted in ('true','false'). Las filas 'pending' (read_failed /
-- follow_pending / no-verificado) NO son definitivas → siguen siendo reintentables.
-- Zona America/New_York + lower(network) para coincidir con el coverage-sweep y el
-- guard del dispatch (ver memoria promolog_dispatch_guard_watchdog / maven_data_rls).

create or replace function public.promolog_ig_scan_state_today()
returns table(creator_id uuid, has_definitive boolean)
language sql
security definer
set search_path = public
as $$
  select e.creator_id,
         bool_or(e.promoted in ('true','false')) as has_definitive
  from promolog_entries e
  where lower(e.network) = 'instagram'
    and e.creator_id is not null
    and (e.date at time zone 'America/New_York')::date
        = (now() at time zone 'America/New_York')::date
  group by e.creator_id;
$$;

revoke all on function public.promolog_ig_scan_state_today() from public, anon;
grant execute on function public.promolog_ig_scan_state_today() to service_role;
