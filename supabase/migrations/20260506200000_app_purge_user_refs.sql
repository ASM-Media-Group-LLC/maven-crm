-- Limpia dinámicamente todas las refs en `public` a un user_id antes
-- de poder borrar la fila de auth.users. Reemplaza la lista hardcoded
-- de tablas que tenía el edge function delete_user — había 49 FKs a
-- auth.users en public, el edge solo cubría 6, y el resto bloqueaba
-- el delete con "Database error deleting user".
--
-- Estrategia por columna:
--   - nullable      → UPDATE SET NULL (preserva la fila para auditoría)
--   - NOT NULL      → DELETE de la fila (la fila no tiene sentido sin owner)
--
-- La función es SECURITY DEFINER para que pueda hacer UPDATE/DELETE en
-- todas las tablas referenciadas independiente de las RLS policies.
-- Solo la llamamos desde el edge function admin-user-actions que ya
-- valida que el caller es admin (auth.users → user_roles role='admin').

CREATE OR REPLACE FUNCTION public.app_purge_user_refs(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_sql text;
BEGIN
  FOR r IN
    SELECT
      c.conrelid::regclass::text AS tbl,
      a.attname AS col,
      a.attnotnull AS not_null
    FROM pg_constraint c
    JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum  = k.attnum
    WHERE c.confrelid = 'auth.users'::regclass
      AND c.connamespace = 'public'::regnamespace
  LOOP
    IF r.not_null THEN
      v_sql := format('DELETE FROM %s WHERE %I = $1', r.tbl, r.col);
    ELSE
      v_sql := format('UPDATE %s SET %I = NULL WHERE %I = $1', r.tbl, r.col, r.col);
    END IF;
    EXECUTE v_sql USING p_user_id;
  END LOOP;

  -- profiles tiene PK = auth.users.id, así que va al final.
  DELETE FROM public.profiles WHERE id = p_user_id;
END;
$$;

-- Acceso solo para service_role (que es lo que usa el edge function
-- admin-user-actions). No exponer al rol authenticated normal.
REVOKE ALL ON FUNCTION public.app_purge_user_refs(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_purge_user_refs(uuid) TO service_role;
