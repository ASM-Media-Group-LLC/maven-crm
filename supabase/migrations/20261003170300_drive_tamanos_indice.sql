-- Drive: el índice que hace rápido el tamaño de las carpetas (drive_sumar_carpeta).
--
-- Jhon, 03/10: «se tarda bastante en mostrarme el tamaño». drive_sumar_carpeta
-- baja de a un nivel con `parent_id = ANY(nivel)` y suma size/tipo/estado: con
-- drive_items_hijos_idx encontraba las filas por índice pero después iba a la
-- TABLA por cada una (890.000 filas = 406.000 páginas leídas). Este índice trae
-- esas columnas adentro (INCLUDE), así que la suma sale del índice solo (Index
-- Only Scan). Mismo orden y mismo filtro que drive_items_hijos_idx.
--
-- Medido en prod el 03/10, drive_tamanos de las 59 unidades como Jhon, en
-- caliente: 873 ms → 530 ms. En frío gana más: el índice pesa 81 MB y la tabla
-- 224 MB. ⚠️ El Index Only Scan necesita el mapa de visibilidad al día: recién
-- creado, con las importaciones de esos días sin VACUUM, todavía iba a la tabla
-- en 514.000 filas. Se corrió `VACUUM (ANALYZE) public.drive_items;` a mano
-- (normal, no FULL: no bloquea). Después lo mantiene el autovacuum.
--
-- ⚠️ APLICAR SOLA y FUERA DE UNA TRANSACCIÓN (editor SQL de Supabase o
-- execute_sql con solo esta sentencia): CONCURRENTLY no corre dentro de una, y
-- sin CONCURRENTLY el índice bloquearía las escrituras de drive_items mientras
-- se arma. YA APLICADA en prod el 03/10 (IF NOT EXISTS: volver a correrla no hace nada).
--
-- Si se corta a mitad, queda un índice INVÁLIDO: se ve con
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
-- y se arregla con DROP INDEX CONCURRENTLY public.drive_items_hijos_tamano_idx;
-- y volviendo a correr esto.
--
-- Comprobar después:
--   EXPLAIN (ANALYZE, BUFFERS) SELECT sum(size) FROM public.drive_items
--   WHERE tenant_id = '<agencia>' AND parent_id = ANY('{<ids>}') AND trashed_at IS NULL;
--   → Index Only Scan using drive_items_hijos_tamano_idx, «Heap Fetches» bajo.

CREATE INDEX CONCURRENTLY IF NOT EXISTS drive_items_hijos_tamano_idx
  ON public.drive_items (tenant_id, parent_id) INCLUDE (tipo, estado, size, id)
  WHERE trashed_at IS NULL;

--| DROP INDEX CONCURRENTLY IF EXISTS public.drive_items_hijos_tamano_idx;
