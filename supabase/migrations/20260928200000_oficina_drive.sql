-- OFICINA · Drive.
--
-- Jhon, 28/09: «dentro de office me gustaría poner drive». Decidido ese día:
-- los archivos viven 100% en el NAS de mini5 (sin R2 y SIN copia de
-- seguridad), servidos por infra/nas-drive detrás de un Cloudflare Tunnel.
-- Acá vive solo la FICHA de cada archivo: nombre, carpeta, dueño, agencia,
-- tamaño, huella. El contenido nunca pasa por Supabase.
--
-- ⚠️ MULTI-AGENCIA: cada fila lleva su tenant_id y TODA política lo exige.
-- Compartir solo se puede con alguien de la misma agencia (trigger). La ruta en
-- el NAS es `<tenant_id>/<id>`: la agencia va en el camino físico también.
--
-- ⚠️ LO QUE EL NAVEGADOR NO PUEDE ESCRIBIR: storage_key, tamaño, huella y
-- estado. Los pone la edge `drive` (service_role) después de verificar el
-- recibo firmado del NAS. Si el navegador pudiera escribir storage_key, podría
-- apuntar su ficha al archivo de otra persona y bajarlo con un permiso válido.

CREATE TABLE public.drive_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id),
  -- Nullable a propósito: si se borra la cuenta, el archivo no se borra con
  -- ella (qué pasa con lo de una baja es la fase 3).
  owner_id       uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  parent_id      uuid REFERENCES public.drive_items(id) ON DELETE CASCADE,
  tipo           text NOT NULL CHECK (tipo IN ('carpeta', 'archivo')),
  nombre         text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 255 AND nombre !~ '[/\\]'),
  mime           text,
  size           bigint CHECK (size IS NULL OR size >= 0),
  sha256         text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  storage_key    text UNIQUE,
  -- 'subiendo' = la ficha existe pero el NAS todavía no confirmó el archivo.
  estado         text NOT NULL DEFAULT 'listo' CHECK (estado IN ('subiendo', 'listo')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  last_opened_at timestamptz,
  trashed_at     timestamptz,
  CHECK (parent_id IS NULL OR parent_id <> id),
  -- Un archivo tiene dónde vivir; una carpeta no.
  CHECK ((tipo = 'archivo') = (storage_key IS NOT NULL))
);

CREATE INDEX drive_items_hijos_idx ON public.drive_items (tenant_id, parent_id) WHERE trashed_at IS NULL;
CREATE INDEX drive_items_dueno_idx ON public.drive_items (owner_id, parent_id);
CREATE INDEX drive_items_recientes_idx ON public.drive_items (owner_id, last_opened_at DESC) WHERE tipo = 'archivo';
CREATE INDEX drive_items_papelera_idx ON public.drive_items (owner_id, trashed_at) WHERE trashed_at IS NOT NULL;

CREATE TABLE public.drive_shares (
  item_id    uuid NOT NULL REFERENCES public.drive_items(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rol        text NOT NULL DEFAULT 'lector' CHECK (rol IN ('lector', 'editor')),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);
CREATE INDEX drive_shares_usuario_idx ON public.drive_shares (user_id);

-- ── Quién puede qué ─────────────────────────────────────────────────────────
-- Compartir una carpeta comparte todo lo de adentro, como Google Drive: se
-- sube por los ancestros buscando un permiso. Tope de 50 niveles para que un
-- ciclo (que un trigger impide) no pueda colgar la consulta.
--
-- SECURITY DEFINER porque consulta drive_shares y drive_items sin pasar por
-- sus propias políticas (si no, la política de drive_items se llamaría a sí
-- misma). Por eso mismo exige la agencia ADENTRO.

CREATE OR REPLACE FUNCTION public.drive_mi_rol(p_item uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE cadena AS (
    SELECT i.id, i.parent_id, i.owner_id, i.tenant_id, 0 AS nivel
    FROM public.drive_items i WHERE i.id = p_item
    UNION ALL
    SELECT p.id, p.parent_id, p.owner_id, p.tenant_id, c.nivel + 1
    FROM public.drive_items p JOIN cadena c ON p.id = c.parent_id
    WHERE c.nivel < 50
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM cadena WHERE nivel = 0 AND tenant_id = public.current_tenant_id()) THEN NULL
    WHEN EXISTS (SELECT 1 FROM cadena WHERE owner_id = auth.uid()) THEN 'dueno'
    WHEN EXISTS (SELECT 1 FROM cadena c JOIN public.drive_shares s ON s.item_id = c.id
                 WHERE s.user_id = auth.uid() AND s.rol = 'editor') THEN 'editor'
    WHEN EXISTS (SELECT 1 FROM cadena c JOIN public.drive_shares s ON s.item_id = c.id
                 WHERE s.user_id = auth.uid()) THEN 'lector'
    ELSE NULL
  END
$$;

REVOKE ALL ON FUNCTION public.drive_mi_rol(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.drive_mi_rol(uuid) TO authenticated, service_role;

-- ── Políticas ───────────────────────────────────────────────────────────────
ALTER TABLE public.drive_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drive_shares ENABLE ROW LEVEL SECURITY;

-- (SELECT current_tenant_id()) y no current_tenant_id() suelto: envuelto se
-- evalúa UNA vez por consulta y no por fila (ver rls_initplan_fila_por_fila).
--
-- ⚠️ `owner_id = auth.uid()` va SUELTO, además de drive_mi_rol: al crear una
-- carpeta el navegador pide la fila de vuelta (INSERT … RETURNING), y
-- drive_mi_rol —STABLE, con la foto del inicio de la sentencia— todavía no la
-- ve. Sin esto, crear una carpeta fallaba con «violates row-level security»
-- (lo encontró la prueba contra prod del 28/09).
CREATE POLICY drive_items_ver ON public.drive_items
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (owner_id = (SELECT auth.uid()) OR public.drive_mi_rol(id) IS NOT NULL)
  );

-- El navegador solo crea CARPETAS. Los archivos los crea la edge al empezar
-- una subida, con su storage_key.
CREATE POLICY drive_items_crear_carpeta ON public.drive_items
  FOR INSERT TO authenticated
  WITH CHECK (
    tipo = 'carpeta'
    AND tenant_id = (SELECT public.current_tenant_id())
    AND owner_id = (SELECT auth.uid())
    AND (parent_id IS NULL OR public.drive_mi_rol(parent_id) IN ('dueno', 'editor'))
  );

-- Renombrar, mover y mandar a la papelera. Qué columnas se pueden tocar lo
-- cuida el trigger de abajo.
CREATE POLICY drive_items_editar ON public.drive_items
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()) AND public.drive_mi_rol(id) IN ('dueno', 'editor'))
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

-- Sin política de DELETE: borrar para siempre tiene que borrar también en el
-- NAS, y eso lo hace la edge.

CREATE POLICY drive_shares_ver ON public.drive_shares
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.drive_mi_rol(item_id) IN ('dueno', 'editor'));

CREATE POLICY drive_shares_dar ON public.drive_shares
  FOR INSERT TO authenticated
  WITH CHECK (public.drive_mi_rol(item_id) IN ('dueno', 'editor'));

CREATE POLICY drive_shares_cambiar ON public.drive_shares
  FOR UPDATE TO authenticated
  USING (public.drive_mi_rol(item_id) IN ('dueno', 'editor'));

CREATE POLICY drive_shares_quitar ON public.drive_shares
  FOR DELETE TO authenticated
  USING (public.drive_mi_rol(item_id) IN ('dueno', 'editor') OR user_id = (SELECT auth.uid()));

-- ── Lo que el navegador no puede cambiar ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.drive_items_cuidar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  actual uuid;
  pasos int := 0;
BEGIN
  NEW.updated_at := now();
  -- La edge (service_role) sí puede: es la que confirma subidas.
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.tipo IS DISTINCT FROM OLD.tipo OR NEW.storage_key IS DISTINCT FROM OLD.storage_key
       OR NEW.size IS DISTINCT FROM OLD.size OR NEW.sha256 IS DISTINCT FROM OLD.sha256
       OR NEW.estado IS DISTINCT FROM OLD.estado OR NEW.mime IS DISTINCT FROM OLD.mime
       OR NEW.last_opened_at IS DISTINCT FROM OLD.last_opened_at THEN
      RAISE EXCEPTION 'Solo se puede cambiar el nombre, la carpeta o mandar a la papelera' USING ERRCODE = '42501';
    END IF;
  END IF;
  -- Mover: a una carpeta de la MISMA agencia, que pueda editar, y que no sea
  -- una de sus propias subcarpetas.
  IF NEW.parent_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.parent_id IS DISTINCT FROM OLD.parent_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.drive_items p
                   WHERE p.id = NEW.parent_id AND p.tipo = 'carpeta' AND p.tenant_id = NEW.tenant_id) THEN
      RAISE EXCEPTION 'La carpeta de destino no existe' USING ERRCODE = '23503';
    END IF;
    IF public.drive_mi_rol(NEW.parent_id) NOT IN ('dueno', 'editor') THEN
      RAISE EXCEPTION 'No podés guardar en esa carpeta' USING ERRCODE = '42501';
    END IF;
    actual := NEW.parent_id;
    WHILE actual IS NOT NULL LOOP
      IF actual = NEW.id THEN
        RAISE EXCEPTION 'Una carpeta no puede quedar dentro de sí misma' USING ERRCODE = '23514';
      END IF;
      pasos := pasos + 1;
      EXIT WHEN pasos > 50;
      SELECT parent_id INTO actual FROM public.drive_items WHERE id = actual;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER drive_items_cuidar
  BEFORE INSERT OR UPDATE ON public.drive_items
  FOR EACH ROW EXECUTE FUNCTION public.drive_items_cuidar();

-- Compartir solo dentro de la agencia, y nunca con uno mismo.
CREATE OR REPLACE FUNCTION public.drive_shares_misma_agencia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.drive_items i
    JOIN public.tenant_members m ON m.tenant_id = i.tenant_id AND m.user_id = NEW.user_id
    WHERE i.id = NEW.item_id
  ) THEN
    RAISE EXCEPTION 'Solo se puede compartir con alguien de la misma agencia' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.drive_items WHERE id = NEW.item_id AND owner_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Ya es el dueño' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER drive_shares_misma_agencia
  BEFORE INSERT OR UPDATE ON public.drive_shares
  FOR EACH ROW EXECUTE FUNCTION public.drive_shares_misma_agencia();

COMMENT ON TABLE public.drive_items IS
  'Drive de Oficina: la ficha de cada archivo/carpeta. El contenido vive en el NAS (infra/nas-drive), en <tenant_id>/<id>. Sin copia de seguridad por decisión de Jhon (28/09/2026).';
COMMENT ON COLUMN public.drive_items.storage_key IS
  'Ruta en el NAS. La pone SOLO la edge drive; el navegador no puede tocarla (trigger drive_items_cuidar).';
