-- La regla de seguridad de LeadGen se evaluaba FILA POR FILA.
--
-- 17/09/2026, tras las tres caídas del día. `leadgen_entries` era la tabla que
-- más filas leía de toda la base: 21.368 millones de tuplas en 402.781
-- recorridos, sobre una tabla de apenas 24.207 filas.
--
-- El motivo, medido con EXPLAIN (analyze) simulando a una persona SIN alcance
-- global y contando la tabla:
--
--   Execution Time: 6357.812 ms
--   Buffers: shared hit=295939      <- 12 bloques POR FILA, para 24.207 filas
--   Filter: (has_leadgen_global_scope(...auth.uid()...) OR lg_user_id = ...)
--
-- `has_leadgen_global_scope` hace tres uniones por dentro (user_roles,
-- roles_config, role_permissions). Postgres la llamaba en CADA fila: una
-- función suelta dentro de una política no se saca sola del bucle, aunque sea
-- STABLE y su argumento no dependa de la fila.
--
-- EL ARREGLO: envolver en (SELECT ...). Es el remedio documentado de Supabase y
-- NO cambia el significado: una expresión STABLE que no mira la fila devuelve
-- lo mismo evaluada una vez que evaluada un millón de veces. Lo que cambia es
-- que Postgres la resuelve UNA sola vez por consulta (InitPlan).
--
-- Se usa ALTER POLICY y no DROP+CREATE a propósito: así no se puede cambiar por
-- accidente si la política es PERMISSIVE o RESTRICTIVE, a qué comando aplica ni
-- a qué roles. `leadgen_entries_scope_select` es RESTRICTIVE y tiene que
-- seguirlo siendo: si se volviera permisiva dejaría de acotar nada.
--
-- ── COMPROBACIÓN DE SEGURIDAD (lo que de verdad importa) ────────────────────
-- Antes y después se simularon cuatro personas reales, dos con alcance global y
-- dos sin él, contando filas visibles. Idéntico en los cuatro casos, y las dos
-- sin alcance global vieron CERO filas ajenas:
--
--            antes    después
--   Brayan   24.207   24.207   (global)
--   Jhon     24.207   24.207   (global)
--   Daniel    5.294    5.294   (solo suyas, 0 ajenas)
--   Isabel      309      309   (solo suyas, 0 ajenas)
--
-- ── EFECTO ──────────────────────────────────────────────────────────────────
--   antes:   6357,81 ms · 295.939 bloques
--   después:   11,45 ms ·   6.280 bloques
--   o sea 555 veces más rápido y 47 veces menos trabajo.
--
-- Para revertir:
--   ALTER POLICY leadgen_entries_tenant_scoped ON public.leadgen_entries
--     USING (tenant_id = current_tenant_id())
--     WITH CHECK (tenant_id = current_tenant_id());
--   ALTER POLICY leadgen_entries_scope_select ON public.leadgen_entries
--     USING (has_leadgen_global_scope(auth.uid()) OR (lg_user_id = auth.uid()));
--
-- ⚠️ ESTO NO ES UN CASO AISLADO: los avisos de rendimiento de Supabase reportan
-- 381 políticas con el mismo patrón en 219 tablas. Las calientes que faltan son
-- profiles, user_roles, notifications, chatter_sessions y las de cowork.

ALTER POLICY leadgen_entries_tenant_scoped ON public.leadgen_entries
  USING (tenant_id = (SELECT public.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

ALTER POLICY leadgen_entries_scope_select ON public.leadgen_entries
  USING (
    (SELECT public.has_leadgen_global_scope((SELECT auth.uid())))
    OR (lg_user_id = (SELECT auth.uid()))
  );
