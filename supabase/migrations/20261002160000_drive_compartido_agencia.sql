-- Drive: COMPARTIR CON TODA LA AGENCIA, como «Cualquier persona de unlok.me»
-- en Google (decisión de Jhon, 02/10).
--
-- Al pasar de Google faltaron carpetas (María Villegas, Isabel Tuiran): no
-- estaban compartidas a SU nombre, sino con toda la empresa, con un enlace o
-- con un espacio de Chat. Maven solo sabía compartir con personas. Ahora:
--
--   · drive_compartido_agencia: una carpeta (o archivo) abierta a toda su
--     agencia, como lector o editor. Como un compartido normal, vale para todo
--     lo de adentro.
--   · drive_mi_rol la tiene en cuenta (sin esto, la RLS no deja ver nada).
--   · drive_de_toda_la_agencia(): lo abierto a la agencia que va en
--     «Compartido conmigo» (solo lo de más arriba: si ya veo la carpeta madre,
--     no se repite).
--   · drive_acceso_general(item): de dónde viene el acceso general de una
--     ficha (ella misma o una carpeta de arriba), para el diálogo de compartir.
--
-- Lo que en Google estaba «con el enlace» también entra como agencia: en Maven
-- no hay enlaces públicos y Jhon pidió que nadie pierda lo que veía.

DO $$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'drive_mi_rol' AND pronamespace = 'public'::regnamespace)
     IS DISTINCT FROM '4469ead9ec3b660282466dbfe1511dff' THEN
    RAISE EXCEPTION 'drive_mi_rol cambió en la base: revisar antes de reemplazarla';
  END IF;
END $$;

-- ── 1. Lo abierto a la agencia ───────────────────────────────────────────────
CREATE TABLE public.drive_compartido_agencia (
  item_id    uuid PRIMARY KEY REFERENCES public.drive_items(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rol        text NOT NULL CHECK (rol IN ('lector', 'editor')),
  -- Cómo estaba en Google (dominio, enlace, chat, allteam); null si se abrió en Maven.
  de_google  text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX drive_compartido_agencia_tenant_idx ON public.drive_compartido_agencia (tenant_id);

-- La agencia es SIEMPRE la de la ficha: no se puede abrir algo a otra agencia.
CREATE OR REPLACE FUNCTION public.drive_compartido_agencia_cuidar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT i.tenant_id INTO NEW.tenant_id FROM public.drive_items i WHERE i.id = NEW.item_id;
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'La ficha no existe' USING ERRCODE = '23503';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.drive_compartido_agencia_cuidar() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER drive_compartido_agencia_cuidar BEFORE INSERT OR UPDATE ON public.drive_compartido_agencia
  FOR EACH ROW EXECUTE FUNCTION public.drive_compartido_agencia_cuidar();

ALTER TABLE public.drive_compartido_agencia ENABLE ROW LEVEL SECURITY;
-- Se ve si se puede ver la ficha; lo abre o lo cierra quien puede compartirla
-- (dueño o editor), como un compartido con una persona.
CREATE POLICY drive_compartido_agencia_ver ON public.drive_compartido_agencia FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()) AND public.drive_mi_rol(item_id) IS NOT NULL);
CREATE POLICY drive_compartido_agencia_dar ON public.drive_compartido_agencia FOR INSERT TO authenticated
  WITH CHECK (public.drive_mi_rol(item_id) IN ('dueno', 'editor'));
CREATE POLICY drive_compartido_agencia_cambiar ON public.drive_compartido_agencia FOR UPDATE TO authenticated
  USING (public.drive_mi_rol(item_id) IN ('dueno', 'editor'))
  WITH CHECK (public.drive_mi_rol(item_id) IN ('dueno', 'editor'));
CREATE POLICY drive_compartido_agencia_quitar ON public.drive_compartido_agencia FOR DELETE TO authenticated
  USING (public.drive_mi_rol(item_id) IN ('dueno', 'editor'));
REVOKE ALL ON public.drive_compartido_agencia FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drive_compartido_agencia TO authenticated;

-- ── 2. El rol de alguien sobre una ficha ─────────────────────────────────────
-- Igual que antes, más lo abierto a la agencia en cualquier carpeta de arriba.
-- La agencia de la ficha ya se comprobó en la primera rama, así que basta con
-- que la fila exista.
CREATE OR REPLACE FUNCTION public.drive_mi_rol(p_item uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                 WHERE s.user_id = auth.uid() AND s.rol = 'editor')
      OR EXISTS (SELECT 1 FROM cadena c JOIN public.drive_compartido_agencia a ON a.item_id = c.id
                 WHERE a.rol = 'editor') THEN 'editor'
    WHEN EXISTS (SELECT 1 FROM cadena c JOIN public.drive_shares s ON s.item_id = c.id
                 WHERE s.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM cadena c JOIN public.drive_compartido_agencia a ON a.item_id = c.id) THEN 'lector'
    ELSE NULL
  END
$function$;

-- ── 3. Qué va en «Compartido conmigo» ────────────────────────────────────────
-- Lo abierto a la agencia que no se ve ya por otro lado: si puedo abrir la
-- carpeta madre (porque soy de la unidad, por ejemplo), ya lo encuentro ahí.
CREATE OR REPLACE FUNCTION public.drive_de_toda_la_agencia()
 RETURNS TABLE(item_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.item_id
  FROM public.drive_compartido_agencia a
  JOIN public.drive_items i ON i.id = a.item_id
  WHERE a.tenant_id = public.current_tenant_id()
    AND i.trashed_at IS NULL
    AND (i.parent_id IS NULL OR public.drive_mi_rol(i.parent_id) IS NULL)
$function$;
REVOKE EXECUTE ON FUNCTION public.drive_de_toda_la_agencia() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.drive_de_toda_la_agencia() TO authenticated;

-- ── 4. De dónde viene el acceso general de una ficha ─────────────────────────
-- La más cercana hacia arriba (nivel 0 = la ficha misma). Nada si es
-- «Restringido» o si no la puedo ver.
CREATE OR REPLACE FUNCTION public.drive_acceso_general(p_item uuid)
 RETURNS TABLE(item_id uuid, nombre text, rol text, nivel integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH RECURSIVE cadena AS (
    SELECT i.id, i.parent_id, i.nombre, 0 AS nivel
    FROM public.drive_items i WHERE i.id = p_item AND public.drive_mi_rol(p_item) IS NOT NULL
    UNION ALL
    SELECT p.id, p.parent_id, p.nombre, c.nivel + 1
    FROM public.drive_items p JOIN cadena c ON p.id = c.parent_id
    WHERE c.nivel < 50
  )
  SELECT c.id, c.nombre, a.rol, c.nivel
  FROM cadena c JOIN public.drive_compartido_agencia a ON a.item_id = c.id
  ORDER BY c.nivel
  LIMIT 1
$function$;
REVOKE EXECUTE ON FUNCTION public.drive_acceso_general(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.drive_acceso_general(uuid) TO authenticated;

--| DROP FUNCTION IF EXISTS public.drive_acceso_general(uuid);
--| DROP FUNCTION IF EXISTS public.drive_de_toda_la_agencia();
--| (volver a crear drive_mi_rol con la versión de 20260928200000_oficina_drive.sql, huella 4469ead9…)
--| DROP TABLE IF EXISTS public.drive_compartido_agencia;
--| DROP FUNCTION IF EXISTS public.drive_compartido_agencia_cuidar();
