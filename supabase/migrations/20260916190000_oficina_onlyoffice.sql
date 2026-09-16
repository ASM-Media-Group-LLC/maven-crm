-- Oficina · el documento pasa a ser un ARCHIVO de Office.
--
-- Cambio de rumbo decidido con Jhon el 16/09/2026: el editor propio (TipTap)
-- se ve como un editor de notas y lo que hacía falta era un procesador de texto
-- de verdad. Entra ONLYOFFICE Docs, autohospedado en un servidor aparte
-- —agregado al mismo Dokploy como Remote Server, para que su CPU no compita con
-- `whisper` y el bot de WhatsApp.
--
-- Consecuencia en los datos: un documento ya NO es HTML en una columna, es un
-- `.docx` en R2 del que la base guarda la llave, el tamaño y el número de
-- versión. OnlyOffice es quien lo abre, lo edita y lo devuelve.
--
-- Se puede hacer sin ceremonia porque hay UN documento y está vacío: nadie
-- escribió nada todavía.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS storage_key text,
  ADD COLUMN IF NOT EXISTS extension   text NOT NULL DEFAULT 'docx',
  ADD COLUMN IF NOT EXISTS size_bytes  bigint,
  -- OnlyOffice identifica cada versión con una "key" y se niega a recargar si
  -- no cambia: mostraría el documento viejo aunque el archivo sea otro. Se
  -- deriva de (id, version), así que este número TIENE que subir en cada
  -- guardado.
  ADD COLUMN IF NOT EXISTS version     int NOT NULL DEFAULT 1;

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_extension_check;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_extension_check
  CHECK (extension IN ('docx', 'xlsx', 'pptx'));

COMMENT ON COLUMN public.documents.storage_key IS
  'Llave del archivo en R2 (bucket maven-oficina). NULL = el documento se creó pero su archivo todavía no se subió.';
COMMENT ON COLUMN public.documents.version IS
  'Sube en cada guardado. Junto con el id forma la "key" que OnlyOffice usa para saber que el documento cambió; si no cambia, muestra la versión vieja.';

-- ── Lo que deja de existir ──────────────────────────────────────────────────
-- El cuerpo en HTML, su copia en texto y el estado de Yjs eran del editor
-- propio. Se BORRAN en vez de dejarse muertos: son columnas grandes, no hay
-- datos que perder, y una columna que miente es peor que una que no está.
--
-- ⚠️ SE PIERDE LA BÚSQUEDA DENTRO DEL TEXTO. Era una de las cosas buenas de la
-- Fase 1 y hoy no tiene reemplazo: para buscar adentro de un .docx hay que
-- extraerle el texto al guardar. Queda pendiente y está dicho en el PR; el
-- listado sigue buscando por título.
DROP INDEX IF EXISTS public.documents_busqueda_idx;
DROP FUNCTION IF EXISTS public.buscar_documentos(text);

ALTER TABLE public.documents
  DROP COLUMN IF EXISTS content_html,
  DROP COLUMN IF EXISTS content_text,
  DROP COLUMN IF EXISTS ydoc,
  DROP COLUMN IF EXISTS ydoc_saved_at;

-- El versionado guardaba HTML; ahora cada versión es un archivo más en R2.
DROP TRIGGER IF EXISTS documents_versionado ON public.documents;
DROP FUNCTION IF EXISTS public.guardar_version_de_documento();
DROP TABLE IF EXISTS public.document_versions;

CREATE TABLE IF NOT EXISTS public.document_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version      int  NOT NULL,
  storage_key  text NOT NULL,
  size_bytes   bigint,
  saved_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);

COMMENT ON TABLE public.document_versions IS
  'Una fila por guardado: el archivo anterior queda en R2 con su propia llave. Sin esto, "se borró todo" no tiene arreglo.';

CREATE INDEX IF NOT EXISTS document_versions_doc_idx
  ON public.document_versions (document_id, version DESC);

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ver versiones de documentos accesibles" ON public.document_versions;
CREATE POLICY "Ver versiones de documentos accesibles"
  ON public.document_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_versions.document_id
      AND d.deleted_at IS NULL
      AND (d.owner_id = auth.uid() OR d.visibility = 'equipo')
  ));

-- ── El permiso de OnlyOffice para escribir ──────────────────────────────────
-- Cuando alguien termina de editar, el servidor de OnlyOffice —no el navegador—
-- le avisa a Maven que hay archivo nuevo. Ese aviso llega SIN sesión de usuario,
-- así que se identifica con un permiso de un solo uso guardado acá.
--
-- Vive en la base y no en un JWT autocontenido para poder REVOCARLO: cerrar el
-- documento invalida el permiso, y uno filtrado no sirve para siempre.
CREATE TABLE IF NOT EXISTS public.document_edit_grants (
  token        text PRIMARY KEY,
  document_id  uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  /** false = solo puede DESCARGAR el archivo, no guardarlo encima. */
  puede_guardar boolean NOT NULL DEFAULT true,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.document_edit_grants IS
  'Permisos temporales que Maven le entrega a OnlyOffice para bajar y devolver un archivo. Los lee y borra solo la edge con su clave de servicio; nadie los toca desde el navegador.';

CREATE INDEX IF NOT EXISTS document_edit_grants_vencidos_idx
  ON public.document_edit_grants (expires_at);

ALTER TABLE public.document_edit_grants ENABLE ROW LEVEL SECURITY;
-- Sin políticas: ni anon ni authenticated pueden tocarla. Solo la clave de
-- servicio, que las salta.

/** Limpieza de permisos vencidos. La llama la edge al crear uno nuevo, que es
 *  barato y evita depender de un cron para algo que se acumula despacio. */
CREATE OR REPLACE FUNCTION public.limpiar_permisos_de_edicion()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.document_edit_grants WHERE expires_at < now() - interval '1 day';
$$;

REVOKE ALL ON FUNCTION public.limpiar_permisos_de_edicion() FROM anon, authenticated;
