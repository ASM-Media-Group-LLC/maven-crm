-- Drive: el índice de CARPETAS que usa el buscador para saber qué ve cada
-- persona (drive_buscar, 20261003170200_drive_buscar_rapido.sql).
--
-- Para armar «lo que ve» el buscador baja desde cada carpeta compartida con la
-- persona por sus subcarpetas. Con el índice de hijos de siempre
-- (drive_items_hijos_idx) cada paso lee TODOS los hijos (una carpeta de
-- Google puede tener decenas de miles de archivos) para quedarse con las
-- carpetas; este lee solo las carpetas. Son ~40.500 de 891.000 fichas: el
-- índice pesa ~2 MB.
--
-- ⚠️ APLICAR SOLA, FUERA DE UNA TRANSACCIÓN y ANTES de
-- 20261003170200_drive_buscar_rapido.sql (editor SQL de Supabase o
-- execute_sql con solo esta sentencia): CONCURRENTLY no corre dentro de una
-- transacción. Aquella migración se niega a aplicarse si este índice no
-- existe o quedó inválido.
--
-- Si se corta a mitad, queda INVÁLIDO:
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
-- se arregla con DROP INDEX CONCURRENTLY public.drive_items_subcarpetas_idx;
-- y volviendo a correr esto.

CREATE INDEX CONCURRENTLY IF NOT EXISTS drive_items_subcarpetas_idx
  ON public.drive_items (tenant_id, parent_id)
  WHERE tipo = 'carpeta' AND trashed_at IS NULL;

--| DROP INDEX CONCURRENTLY IF EXISTS public.drive_items_subcarpetas_idx;
