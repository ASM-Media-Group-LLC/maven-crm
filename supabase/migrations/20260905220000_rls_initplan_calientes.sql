-- auth.uid() suelto dentro de una política se evalúa UNA VEZ POR FILA.
-- Envuelto en (select auth.uid()) el planificador lo saca a un InitPlan y lo
-- resuelve una sola vez por consulta. Es lo que marca el linter de Supabase
-- como auth_rls_initplan (386 avisos en el proyecto).
--
-- Acá se tocan SOLO las tablas calientes medidas el 04/09 sobre edge_logs:
-- chat_messages (1,13 M peticiones/día), mail_messages (568 k), mail_folders
-- (215 k), chat_participants (177 k), chat_conversations (75 k) y
-- chat_read_receipts (35 k). Son 19 políticas.
--
-- Es un reemplazo de TEXTO sobre la expresión existente: no cambia la lógica
-- de ninguna política, solo dónde se evalúa auth.uid(). Verificado después de
-- aplicarlo en prod: 19 envueltas, 0 sin envolver, 0 doblemente envueltas, y
-- el aislamiento sigue en pie (un uid desconocido ve 0 filas en las tres
-- tablas; el propio usuario ve las suyas).
--
-- El lookbehind va con ~* (insensible a mayúsculas) A PROPÓSITO: Postgres
-- normaliza la expresión guardada a "( SELECT auth.uid() AS uid)", en
-- mayúsculas, así que un lookbehind en minúsculas volvería a envolver lo ya
-- envuelto en cada corrida. Con ~* esto es idempotente.
DO $$
DECLARE
  r record;
  sentencia text;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'chat_messages', 'chat_participants', 'chat_conversations',
        'chat_read_receipts', 'mail_messages', 'mail_folders'
      )
      AND (qual ~* '(?<!select )auth\.uid\(\)' OR with_check ~* '(?<!select )auth\.uid\(\)')
  LOOP
    sentencia := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);

    IF r.qual IS NOT NULL THEN
      sentencia := sentencia || format(
        ' USING (%s)',
        regexp_replace(r.qual, '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'gi')
      );
    END IF;

    IF r.with_check IS NOT NULL THEN
      sentencia := sentencia || format(
        ' WITH CHECK (%s)',
        regexp_replace(r.with_check, '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'gi')
      );
    END IF;

    RAISE NOTICE 'aplicando: %', sentencia;
    EXECUTE sentencia;
  END LOOP;
END $$;
