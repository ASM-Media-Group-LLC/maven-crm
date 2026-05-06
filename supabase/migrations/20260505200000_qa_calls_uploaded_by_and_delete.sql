-- Add uploaded_by to qa_calls + admin-only delete policy.
--
-- Why:
--  - "Mis QAs" en QA History filtraba por evaluator_name == perfil del
--    usuario. Cambiamos el evaluador default a "Claude AI" (la IA hace
--    la eval), así que ese filtro nunca matchea. Necesitamos un FK al
--    user real que subió la llamada.
--  - Los admins necesitan poder borrar llamadas (para limpiar tests,
--    duplicados, contenido inapropiado). El resto de roles no.

-- 1. uploaded_by — quién subió esta QA. NULL para legacy rows; el client
--    fallback-ea a evaluator_name match para esos casos en QA History.
ALTER TABLE public.qa_calls
  ADD COLUMN IF NOT EXISTS uploaded_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS qa_calls_uploaded_by_idx
  ON public.qa_calls(uploaded_by);

-- 2. Delete policy: solo admins (rol === 'admin' en user_roles).
--    Los demás roles no pueden borrar — la policy DELETE existente del
--    qa_calls_write era permisiva (USING true) y daba write+delete a
--    cualquier authenticated. Refactorizamos: write se queda permisivo
--    para insert/update, delete pasa a admin-only.
DROP POLICY IF EXISTS "qa_calls_write" ON public.qa_calls;

CREATE POLICY "qa_calls_insert_update"
  ON public.qa_calls
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Override DELETE: requiere admin. La policy más restrictiva gana cuando
-- ambas se aplican al mismo command (postgres aplica AND entre policies
-- para SELECT/UPDATE pero solo se chequea una para DELETE — por eso
-- separamos: la insert_update permite ALL menos DELETE en la práctica
-- porque agregamos esta delete restrictive policy).
CREATE POLICY "qa_calls_delete_admin"
  ON public.qa_calls
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    )
  );
