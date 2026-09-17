-- OFICINA · compartir un documento con personas concretas.
--
-- Mismo pedido de Jhon (17/09/2026) que destapó lo del calendario: compartir
-- era binario, o privado o todo el equipo. Acá la forma es distinta — un
-- invitado a una reunión RESPONDE, alguien con quien compartís un documento
-- tiene un PERMISO: verlo, o además editarlo.
--
-- ⚠️ Ortogonal a `visibility`, igual que los invitados del calendario: un
-- documento privado compartido con dos personas sigue siendo privado. Ellas lo
-- ven porque se lo compartieron, no porque el documento se haya vuelto público.

CREATE TABLE IF NOT EXISTS public.document_shares (
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  puede_editar boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, user_id)
);

-- "Qué me compartieron": la consulta del listado de cada persona.
CREATE INDEX IF NOT EXISTS document_shares_user_idx
  ON public.document_shares (user_id);

-- ── ⚠️ Por qué estas funciones existen ─────────────────────────────────────
-- La política de `documents` necesita preguntar "¿me lo compartieron?" y la de
-- `document_shares` necesita preguntar "¿soy el dueño del documento?". Escritas
-- como subconsultas sueltas se llaman entre sí y Postgres corta con "infinite
-- recursion detected in policy". SECURITY DEFINER salta la RLS adentro y corta
-- el ciclo. Es la misma trampa del calendario y de los documentos de equipo.
CREATE OR REPLACE FUNCTION public.soy_dueno_del_documento(p_doc uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = p_doc AND d.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.me_compartieron_documento(p_doc uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.document_shares s
    WHERE s.document_id = p_doc AND s.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.puedo_editar_compartido(p_doc uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.document_shares s
    WHERE s.document_id = p_doc AND s.user_id = auth.uid() AND s.puede_editar
  );
$$;

-- ── Las políticas del documento pasan a contemplar lo compartido ───────────
DROP POLICY IF EXISTS "Ver documentos propios y del equipo" ON public.documents;
CREATE POLICY "Ver documentos propios, del equipo y los compartidos conmigo"
  ON public.documents FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR (visibility = 'equipo' AND deleted_at IS NULL)
    OR (public.me_compartieron_documento(id) AND deleted_at IS NULL)
  );

-- Editar: el dueño, cualquiera si es del equipo, o quien tenga el permiso.
-- Que nadie se lo apropie, lo esconda ni lo tire a la papelera lo sigue
-- blindando el trigger `tocar_documento`, que congela dueño, visibilidad y
-- papelera para quien no sea el dueño.
DROP POLICY IF EXISTS "Editar documentos propios y del equipo" ON public.documents;
CREATE POLICY "Editar documentos propios, del equipo y los compartidos"
  ON public.documents FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR (visibility = 'equipo' AND deleted_at IS NULL)
    OR (public.puedo_editar_compartido(id) AND deleted_at IS NULL)
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR visibility = 'equipo'
    OR public.puedo_editar_compartido(id)
  );

-- Las versiones se leen si se puede leer el documento.
DROP POLICY IF EXISTS "Ver versiones de documentos accesibles" ON public.document_versions;
CREATE POLICY "Ver versiones de documentos accesibles"
  ON public.document_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_versions.document_id
      AND d.deleted_at IS NULL
      AND (
        d.owner_id = auth.uid()
        OR d.visibility = 'equipo'
        OR public.me_compartieron_documento(d.id)
      )
  ));

-- ── Quién toca la lista de compartidos ─────────────────────────────────────
ALTER TABLE public.document_shares ENABLE ROW LEVEL SECURITY;

-- Quien tiene el documento ve con quién más está compartido: si no, no hay
-- forma de saber quién más lo está editando.
CREATE POLICY "Ver con quién está compartido"
  ON public.document_shares FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.soy_dueno_del_documento(document_id)
    OR public.me_compartieron_documento(document_id)
  );

-- ⚠️ Compartir, cambiar el permiso y dejar de compartir: SOLO el dueño.
-- Si alguien con quien compartieron pudiera volver a compartir, el dueño
-- perdería el control de a dónde llegó su documento.
CREATE POLICY "Compartir mi documento"
  ON public.document_shares FOR INSERT TO authenticated
  WITH CHECK (public.soy_dueno_del_documento(document_id));

CREATE POLICY "Cambiar el permiso de mi documento"
  ON public.document_shares FOR UPDATE TO authenticated
  USING (public.soy_dueno_del_documento(document_id))
  WITH CHECK (public.soy_dueno_del_documento(document_id));

CREATE POLICY "Dejar de compartir mi documento"
  ON public.document_shares FOR DELETE TO authenticated
  USING (public.soy_dueno_del_documento(document_id));

-- La política de UPDATE no impide mover una fila a otro documento o persona.
CREATE OR REPLACE FUNCTION public.tocar_compartido()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.document_id = OLD.document_id;
  NEW.user_id = OLD.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS document_shares_congelar ON public.document_shares;
CREATE TRIGGER document_shares_congelar
  BEFORE UPDATE ON public.document_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.tocar_compartido();

COMMENT ON TABLE public.document_shares IS
  'Con quien se compartio un documento y si puede editarlo. Ortogonal a visibility.';
