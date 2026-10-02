-- Drive: el historial de lo que se edita EN SU LUGAR desde la Oficina (Jhon,
-- 02/10: «que sea exactamente como Google»).
--
-- Abrir un .xlsx/.docx/.pptx del Drive desde la Oficina ya no saca una copia:
-- se edita EL MISMO archivo, como el «modo de edición de Office» de Google, y
-- al guardar la edge oficina-doc (?guardar_drive) escribe el archivo editado en
-- el NAS como un archivo NUEVO y mueve drive_items.storage_key. El anterior NO
-- se pisa ni se borra (lo importado de Google, <agencia>/google/<id>, el NAS
-- ni siquiera deja tocarlo): queda anotado aquí.
--
-- Cada fila es UNA versión, con su archivo en el NAS. La primera vez que se
-- edita un archivo entra también el original (con su dueño y su fecha), así
-- el historial empieza donde empezó el archivo. La vigente es la fila cuyo
-- storage_key coincide con el de la ficha.
--
-- Escribe SOLO la edge (service_role). Se ve si se puede ver el archivo.
-- Borrar para siempre (edge `drive`) borra también estos archivos del NAS.
--
-- ⚠️ Aplicar ANTES de mergear el PR: sin la tabla la edge guarda igual (lo
-- escrito no se pierde), pero la versión anterior queda en el NAS sin anotar.

CREATE TABLE public.drive_versiones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES public.drive_items(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  size        bigint,
  sha256      text,
  saved_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX drive_versiones_item_idx ON public.drive_versiones (item_id, created_at DESC);

ALTER TABLE public.drive_versiones ENABLE ROW LEVEL SECURITY;
-- drive_mi_rol ya exige la agencia adentro (nivel 0 = la ficha).
CREATE POLICY drive_versiones_ver ON public.drive_versiones FOR SELECT TO authenticated
  USING (public.drive_mi_rol(item_id) IS NOT NULL);
REVOKE ALL ON public.drive_versiones FROM anon, authenticated;
GRANT SELECT ON public.drive_versiones TO authenticated;
GRANT ALL ON public.drive_versiones TO service_role;

COMMENT ON TABLE public.drive_versiones IS
  'Versiones de un archivo del Drive editado en su lugar desde la Oficina (oficina-doc ?guardar_drive). Una fila por versión, con su archivo en el NAS; la vigente es la de storage_key igual al de la ficha. Escribe solo service_role.';

--| DROP TABLE IF EXISTS public.drive_versiones;
