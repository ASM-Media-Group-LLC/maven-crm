-- Dashboard: counts server-side en un solo round-trip.
--
-- Antes las stat-cards del Dashboard bajaban las tablas enteras de creators
-- y leads para hacer filter().length en el cliente. Con el cap silencioso de
-- 1000 filas de PostgREST, a partir de 1000 filas los KPI mostraban números
-- INCORRECTOS (antipatrón "muestra publicada como total"), además de lentos.
--
-- SECURITY INVOKER a propósito: los counts respetan RLS igual que las queries
-- que reemplaza (cada rol ve los mismos números que veía, ahora exactos).
create or replace function public.get_dashboard_counts()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'creators', (
      select jsonb_build_object(
        'total', count(*),
        'active', count(*) filter (where status = 'active')
      )
      from public.creators
    ),
    'leads', (
      select jsonb_build_object(
        -- Mismo bucket de día que el cliente viejo (toISOString().slice(0,10) = día UTC)
        'today', count(*) filter (where (created_at at time zone 'utc')::date = (now() at time zone 'utc')::date),
        'interested', count(*) filter (where status in ('interesado', 'contactado')),
        'in_progress', count(*) filter (where status is distinct from 'cerrado' and status is distinct from 'descartado'),
        'closed', count(*) filter (where status = 'cerrado'),
        'by_status', coalesce(
          (
            select jsonb_object_agg(coalesce(s.status, 'null'), s.n)
            from (select status, count(*) as n from public.leads group by status) s
          ),
          '{}'::jsonb
        )
      )
      from public.leads
    )
  );
$$;

grant execute on function public.get_dashboard_counts() to authenticated;
