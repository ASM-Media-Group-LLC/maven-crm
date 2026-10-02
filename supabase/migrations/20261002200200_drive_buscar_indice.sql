-- Drive: el índice del buscador (drive_buscar, migración anterior).
--
-- Trigram sobre el nombre como se busca (minúsculas, sin tildes): hace que
-- `drive_nombre_buscable(nombre) LIKE '%balance%'` entre por índice en vez de
-- leer las ~430.000 fichas. Parcial por `trashed_at IS NULL`, que es el filtro
-- fijo de la búsqueda: más chico y sirve igual.
--
-- ⚠️ APLICAR SOLA y FUERA DE UNA TRANSACCIÓN (editor SQL de Supabase o
-- execute_sql con solo esta sentencia): CONCURRENTLY no corre dentro de una, y
-- sin CONCURRENTLY el índice bloquearía las escrituras de drive_items mientras
-- se arma (segundos con 430.000 filas: subidas y renombres esperando).
-- Requiere la migración anterior (la función drive_nombre_buscable). pg_trgm
-- vive en el esquema PUBLIC en Maven (unaccent, en extensions).
--
-- Si se corta a mitad, queda un índice INVÁLIDO: se ve con
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
-- y se arregla con DROP INDEX CONCURRENTLY public.drive_items_nombre_trgm_idx;
-- y volviendo a correr esto.
--
-- Comprobar después (con un nombre que exista):
--   EXPLAIN SELECT id FROM public.drive_items
--   WHERE trashed_at IS NULL AND public.drive_nombre_buscable(nombre) LIKE '%balance%';
--   → Bitmap Index Scan on drive_items_nombre_trgm_idx

CREATE INDEX CONCURRENTLY IF NOT EXISTS drive_items_nombre_trgm_idx
  ON public.drive_items USING gin (public.drive_nombre_buscable(nombre) public.gin_trgm_ops)
  WHERE trashed_at IS NULL;

--| DROP INDEX CONCURRENTLY IF EXISTS public.drive_items_nombre_trgm_idx;
