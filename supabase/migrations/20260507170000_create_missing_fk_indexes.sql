-- Crea índices en TODA columna FK que no tenga uno todavía. Sin
-- índice, los DELETE/UPDATE en la tabla padre obligan a la DB a hacer
-- sequential scan completo en la hija para validar referential
-- integrity. Con 120 columnas FK sin índice, eso es una bomba de
-- performance esperando a explotar.
--
-- En vez de hardcodear los 120 CREATE INDEX hoy, usamos un DO block
-- que escanea pg_constraint + pg_index en tiempo de migration y crea
-- los faltantes. Es idempotente — si se corre de nuevo después de
-- que alguien agregue otra FK, también la cubre.
--
-- Convención de nombre: idx_<tabla>_<columna>. Si ya existe (porque
-- alguien lo creó manual con otro nombre), IF NOT EXISTS lo skipea.

DO $$
DECLARE
  stmt text;
  created_count int := 0;
BEGIN
  FOR stmt IN (
    WITH fk_cols AS (
      SELECT cl.relname AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN unnest(c.conkey) WITH ORDINALITY AS k(att, ord) ON true
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid
       AND a.attnum = k.att
      WHERE c.contype = 'f'
        AND cl.relnamespace = 'public'::regnamespace
    ),
    idx_first_col AS (
      -- Solo el PRIMER attribute del index counts — un FK column es
      -- usable sólo si está al principio del index. Un compound
      -- index (a, b) sirve para queries por `a` pero no por `b`.
      SELECT cl.relname AS tbl, a.attname AS col
      FROM pg_index i
      JOIN pg_class cl ON cl.oid = i.indrelid
      JOIN unnest(i.indkey) WITH ORDINALITY AS k(att, ord) ON ord = 1
      JOIN pg_attribute a
        ON a.attrelid = i.indrelid
       AND a.attnum = k.att
      WHERE cl.relnamespace = 'public'::regnamespace
    )
    SELECT format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I(%I)',
      'idx_' || fk.tbl || '_' || fk.col,
      fk.tbl,
      fk.col
    )
    FROM fk_cols fk
    WHERE NOT EXISTS (
      SELECT 1 FROM idx_first_col ic
      WHERE ic.tbl = fk.tbl AND ic.col = fk.col
    )
  ) LOOP
    EXECUTE stmt;
    created_count := created_count + 1;
  END LOOP;

  RAISE NOTICE 'Created % missing FK index(es)', created_count;
END$$;
