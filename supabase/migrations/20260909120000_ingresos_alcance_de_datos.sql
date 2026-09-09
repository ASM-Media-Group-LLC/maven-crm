-- Ingresos: cerrar las dos tablas legacy al modulo 'Creator Sales'.
--
-- Ingresos son dos fuentes, y solo la vieja estaba abierta:
--
--   · creator_daily_earnings (43.091 filas, la VIVA, viene de BLU) ya estaba gateada por
--     cde_management (blu_is_management) OR cde_sales_read (has_permission 'Creator Sales').
--     No se toca: Jhon decidio dejarla todo-o-nada, sin bajar el alcance a nivel creadora.
--
--   · of_gross_earnings (17.892 filas) tenia SOLO el candado de tenant => cualquier persona
--     logueada la leia entera. Esta MUERTA desde el 9 de mayo de 2026 (ultima fecha 2026-05-09,
--     ultimo insert 2026-05-10) y 11.332 de sus filas ni siquiera tienen creator_id.
--
--   · missing_creatos_id_of_gross_earnings (24.053 filas) idem: solo tenant. Es residuo legacy
--     de 20260507160000_isolate_legacy_tables y guarda nombres de creadoras en la columna
--     "Creator". No la lee NADIE (ni el front, ni las edge, ni infra) — candidata a borrar.
--
-- Nadie pierde una pantalla: los dos unicos componentes que tocaban of_gross_earnings
-- (EarningsTable y LinkCreatorModal) quedaron huerfanos cuando Dashboard2 paso a
-- creator_daily_earnings — EarningsTable no lo importa ningun archivo del repo.
--
-- Por que RESTRICTIVE y por que FOR ALL: las permisivas se suman con OR, asi que agregar otra
-- permisiva no cerraria nada. Y una restrictiva de solo SELECT seria burlable, porque la
-- permisiva existente es FOR ALL y un UPDATE sin WHERE ni RETURNING no consulta las policies
-- de SELECT. (Ver 20260909100000_promolog_alcance_de_datos.sql, mismo patron.)
--
-- has_permission va envuelto en (select ...) para que Postgres lo evalue una sola vez como
-- InitPlan y no una vez por fila.

drop policy if exists of_gross_earnings_modulo on public.of_gross_earnings;
create policy of_gross_earnings_modulo
  on public.of_gross_earnings
  as restrictive
  for all
  to authenticated
  using      ((select public.has_permission(auth.uid(), 'Creator Sales'::text, null::text)))
  with check ((select public.has_permission(auth.uid(), 'Creator Sales'::text, null::text)));

drop policy if exists missing_creatos_of_gross_modulo on public.missing_creatos_id_of_gross_earnings;
create policy missing_creatos_of_gross_modulo
  on public.missing_creatos_id_of_gross_earnings
  as restrictive
  for all
  to authenticated
  using      ((select public.has_permission(auth.uid(), 'Creator Sales'::text, null::text)))
  with check ((select public.has_permission(auth.uid(), 'Creator Sales'::text, null::text)));
