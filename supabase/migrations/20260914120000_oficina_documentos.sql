-- Oficina · Fase 1: documentos propios de Maven.
--
-- Reemplaza a Google Docs para lo que NACE en Maven (procedimientos, guiones,
-- actas). El contenido se guarda como HTML porque es lo que produce y consume
-- TipTap, el editor que ya usan el Correo y el Messenger.
--
-- `content_text` es el mismo contenido SIN etiquetas. Existe por una sola razón:
-- un documento que no se puede encontrar no sirve de nada, y buscar dentro de
-- HTML encuentra "strong" y "div". Lo escribe el frontend, que es quien tiene el
-- editor; si algún día se desincroniza, la búsqueda falla pero el documento no.
--
-- En la Fase 2 se le agrega la columna del estado de Yjs para la edición en
-- vivo. Esta tabla está pensada para recibirla sin mudanza: el HTML sigue siendo
-- la verdad que se lee, imprime y busca.

CREATE TABLE IF NOT EXISTS public.documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL DEFAULT 'Sin título',
  folder        text,
  content_html  text NOT NULL DEFAULT '',
  content_text  text NOT NULL DEFAULT '',
  -- 'privado' = solo el dueño. 'equipo' = cualquiera en Maven lo ve Y lo edita.
  -- Dos niveles a propósito: los permisos por persona son de la Fase 2, y una
  -- escala de grises que nadie entiende es peor que una regla clara.
  visibility    text NOT NULL DEFAULT 'privado'
                CHECK (visibility IN ('privado', 'equipo')),
  owner_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Papelera. Borrar de verdad un documento que alguien tardó horas en escribir
  -- no puede depender de un clic sin vuelta atrás.
  deleted_at    timestamptz
);

COMMENT ON TABLE public.documents IS
  'Oficina: documentos escritos dentro de Maven. content_html es la verdad; content_text es la copia sin etiquetas para poder buscar.';
COMMENT ON COLUMN public.documents.visibility IS
  'privado = solo el dueño lo ve. equipo = cualquiera con el módulo Oficina lo ve y lo edita.';

-- Listado por defecto: lo último que se tocó, sin los borrados.
CREATE INDEX IF NOT EXISTS documents_recientes_idx
  ON public.documents (updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS documents_owner_idx
  ON public.documents (owner_id)
  WHERE deleted_at IS NULL;

-- Búsqueda por CONTENIDO, no solo por título. En español, que es el idioma en
-- el que el equipo escribe: con la configuración inglesa, "procedimientos" y
-- "procedimiento" serían dos palabras distintas.
CREATE INDEX IF NOT EXISTS documents_busqueda_idx
  ON public.documents
  USING gin (to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(content_text, '')));

-- ── Versiones ───────────────────────────────────────────────────────────────
-- Sin esto, "se borró todo" no tiene arreglo. Se guarda el contenido ANTERIOR,
-- no el nuevo: una versión es a lo que uno quiere volver.
CREATE TABLE IF NOT EXISTS public.document_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  content_html  text NOT NULL,
  content_text  text NOT NULL DEFAULT '',
  title         text,
  saved_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.document_versions IS
  'Fotos del documento ANTES de un cambio, para poder volver atrás. Las escribe un trigger, como mucho una cada 10 minutos por documento.';

CREATE INDEX IF NOT EXISTS document_versions_doc_idx
  ON public.document_versions (document_id, created_at DESC);

-- ── El trigger que guarda las versiones ─────────────────────────────────────
-- Va en la base y no en el frontend a propósito: el guardado automático dispara
-- muchos UPDATE, y una versión por cada uno sería basura. Un tope de tiempo del
-- lado del cliente se lo saltaría cualquier otra vía de escritura.
CREATE OR REPLACE FUNCTION public.guardar_version_de_documento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ultima timestamptz;
BEGIN
  -- Solo interesa el contenido. Renombrar o cambiar la visibilidad no es una
  -- versión nueva.
  IF NEW.content_html IS NOT DISTINCT FROM OLD.content_html THEN
    RETURN NEW;
  END IF;

  SELECT max(created_at) INTO ultima
  FROM public.document_versions
  WHERE document_id = OLD.id;

  -- La primera edición SIEMPRE deja versión: es la que permite deshacer el
  -- primer destrozo sobre un documento que ya estaba bien.
  IF ultima IS NULL OR ultima < now() - interval '10 minutes' THEN
    INSERT INTO public.document_versions (document_id, content_html, content_text, title, saved_by)
    VALUES (OLD.id, OLD.content_html, OLD.content_text, OLD.title, OLD.updated_by);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_versionado ON public.documents;
CREATE TRIGGER documents_versionado
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.guardar_version_de_documento();

-- `updated_at` lo pone la base y no el cliente: es la columna por la que se
-- ordena el listado y un reloj adelantado en un portátil desordenaría a todos.
--
-- Acá también se decide QUÉ puede cambiar quien no es el dueño. Va en un trigger
-- y no en la política de RLS porque la forma natural de escribirlo allá
-- —comparar contra la fila guardada con un subselect sobre `documents`— vuelve a
-- entrar en la política de `documents` y Postgres corta con "infinite recursion
-- detected in policy". El trigger ve OLD y NEW sin consultar nada.
CREATE OR REPLACE FUNCTION public.tocar_documento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();

  -- Quien no es el dueño puede ESCRIBIR el documento, que es el punto de que sea
  -- del equipo, pero no puede quedárselo, esconderlo ni tirarlo a la papelera.
  IF OLD.owner_id IS DISTINCT FROM auth.uid() THEN
    NEW.owner_id   := OLD.owner_id;
    NEW.visibility := OLD.visibility;
    NEW.deleted_at := OLD.deleted_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_updated_at ON public.documents;
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.tocar_documento();

-- ── Quién ve qué ────────────────────────────────────────────────────────────
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

-- El dueño ve TODO lo suyo, papelera incluida —si no, no habría de dónde
-- restaurarlo—. Los demás solo ven lo del equipo que sigue vivo.
CREATE POLICY "Ver documentos propios y del equipo"
  ON public.documents FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR (visibility = 'equipo' AND deleted_at IS NULL));

CREATE POLICY "Crear documentos propios"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- Un documento de equipo lo edita cualquiera: es el punto de tenerlo compartido.
-- Que al hacerlo nadie se lo apropie, lo esconda ni lo tire a la papelera lo
-- blinda el trigger `tocar_documento`, no esta política: el subselect sobre
-- `documents` que haría falta acá sería recursivo.
CREATE POLICY "Editar documentos propios y del equipo"
  ON public.documents FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR (visibility = 'equipo' AND deleted_at IS NULL))
  WITH CHECK (owner_id = auth.uid() OR visibility = 'equipo');

-- Borrar de verdad: solo el dueño. Los demás mandan a la papelera con UPDATE.
CREATE POLICY "Borrar documentos propios"
  ON public.documents FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Las versiones se leen si se puede leer el documento; nadie las escribe a mano
-- (las pone el trigger, que es SECURITY DEFINER).
CREATE POLICY "Ver versiones de documentos accesibles"
  ON public.document_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_versions.document_id
      AND d.deleted_at IS NULL
      AND (d.owner_id = auth.uid() OR d.visibility = 'equipo')
  ));

-- ── Búsqueda ────────────────────────────────────────────────────────────────
-- Función y no un `.or(ilike)` desde el cliente: el índice GIN solo se usa con
-- to_tsvector, y armar la consulta en el frontend obliga a escapar comas y
-- paréntesis a mano, que ya fue fuente de bugs en Grabaciones.
CREATE OR REPLACE FUNCTION public.buscar_documentos(termino text)
RETURNS SETOF public.documents
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT d.*
  FROM public.documents d
  WHERE d.deleted_at IS NULL
    AND (d.owner_id = auth.uid() OR d.visibility = 'equipo')
    AND (
      termino IS NULL OR btrim(termino) = ''
      OR to_tsvector('spanish', coalesce(d.title, '') || ' ' || coalesce(d.content_text, ''))
         @@ plainto_tsquery('spanish', termino)
    )
  ORDER BY d.updated_at DESC
  LIMIT 200;
$$;

COMMENT ON FUNCTION public.buscar_documentos(text) IS
  'Busca en título y contenido. Respeta RLS por sí misma (no es SECURITY DEFINER) y usa el índice en español.';
