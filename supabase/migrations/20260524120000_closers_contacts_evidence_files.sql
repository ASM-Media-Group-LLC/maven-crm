-- closers_contacts_evidence_files — espejo de leadgen_evidence_files
-- pero para CONTACTOS (closers_contacts). Cada contacto que un LG
-- carga vía AddContactoModal debe traer al menos 4 screenshots de
-- evidencia (regla impuesta por el frontend) — esta tabla los guarda.
--
-- Estructura idéntica a leadgen_evidence_files para que el componente
-- frontend EvidenceUploader/EvidenceViewer pueda reusar la misma lógica
-- cambiando solo el nombre de la tabla y el FK.
--
-- Storage: los archivos van al bucket 'creator-files' (compartido con
-- leadgen_evidence_files). file_url guarda el signed URL de 24h o el
-- path si preferimos regenerar signed URLs on-demand.

CREATE TABLE public.closers_contacts_evidence_files (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      uuid NOT NULL REFERENCES public.closers_contacts(id) ON DELETE CASCADE,
  file_url        text NOT NULL,
  file_type       text,
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  uploaded_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_closers_contacts_evidence_contact_id
  ON public.closers_contacts_evidence_files(contact_id);

ALTER TABLE public.closers_contacts_evidence_files ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquiera autenticado del tenant puede leer la evidencia
-- de los contactos visibles. RLS de closers_contacts ya filtra qué
-- contactos ves; si llegás al ID, podés ver su evidencia.
CREATE POLICY closers_contacts_evidence_read
  ON public.closers_contacts_evidence_files
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.closers_contacts cc
      WHERE cc.id = contact_id
    )
  );

-- Insert: el usuario debe ser el creador del contacto (consistente con
-- el flujo: el LG que crea el contacto sube su evidencia).
CREATE POLICY closers_contacts_evidence_insert
  ON public.closers_contacts_evidence_files
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.closers_contacts cc
      WHERE cc.id = contact_id AND cc.created_by = auth.uid()
    )
  );

-- Delete: solo el uploader, o admin/manager (chequeado vía función
-- existente has_role si aplicara — por ahora restringimos al uploader).
CREATE POLICY closers_contacts_evidence_delete
  ON public.closers_contacts_evidence_files
  FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid());

COMMENT ON TABLE public.closers_contacts_evidence_files IS
  'Screenshots de evidencia que el LG adjunta al crear un contacto. '
  'Mínimo 4 archivos exigidos por el frontend en AddContactoModal. '
  'Storage en bucket creator-files. Espejo de leadgen_evidence_files '
  'pero con FK a closers_contacts.';
