-- Drive: el índice por fecha que usa el buscador con palabras comunes
-- (drive_buscar, 20261003170200_drive_buscar_rapido.sql).
--
-- Con una palabra que está en miles de nombres («img»: ~143.000 de 891.000
-- fichas en prod el 03/10), el buscador recorre el Drive de lo más nuevo a lo
-- más viejo y se queda con las primeras que coinciden, en vez de releer y
-- ordenar las 143.000. Este índice es ese recorrido: por agencia, de la
-- última modificación hacia atrás, sin la papelera (el filtro fijo del
-- buscador). ~25–35 MB.
--
-- ⚠️ APLICAR SOLA, FUERA DE UNA TRANSACCIÓN y ANTES de
-- 20261003170200_drive_buscar_rapido.sql (editor SQL de Supabase o
-- execute_sql con solo esta sentencia): CONCURRENTLY no corre dentro de una
-- transacción, y sin CONCURRENTLY el índice bloquearía las escrituras de
-- drive_items mientras se arma. Aquella migración se niega a aplicarse si
-- este índice no existe o quedó inválido.
--
-- Si se corta a mitad, queda INVÁLIDO:
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
-- se arregla con DROP INDEX CONCURRENTLY public.drive_items_modificado_idx;
-- y volviendo a correr esto.

CREATE INDEX CONCURRENTLY IF NOT EXISTS drive_items_modificado_idx
  ON public.drive_items (tenant_id, updated_at DESC)
  WHERE trashed_at IS NULL;

--| DROP INDEX CONCURRENTLY IF EXISTS public.drive_items_modificado_idx;
