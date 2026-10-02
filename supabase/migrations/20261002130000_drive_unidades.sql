-- Drive: UNIDADES COMPARTIDAS como las de Google (decisión de Jhon, 02/10).
--
-- Hasta hoy todo lo que se subía le gastaba el cupo personal (50 GB) a quien lo
-- subía, aunque fuera dentro de una carpeta de la empresa. En Google, lo de una
-- unidad compartida gasta el espacio de la EMPRESA. Ahora:
--
--   · drive_unidades marca qué carpetas son unidades:
--       'empresa'  → una unidad compartida (sin dueño). Lo de adentro gasta el
--                    espacio común de la agencia, no el de la persona.
--       'personal' → la «Mi unidad» de Google de alguien, importada. Se le
--                    muestra en SU «Mi unidad»; lo que suba ahí le cuenta a él.
--   · drive_items.unidad_id = la unidad 'empresa' que contiene la ficha (o
--     null). La mantienen los triggers: al crear, al mover y al marcar una
--     carpeta como unidad. NO es una modificación: no toca updated_at.
--   · drive_espacio_agencia: el tope del espacio común. Sin fila = como el plan
--     Starter de Google, 30 GB por persona de la agencia. por_persona null =
--     sin tope (KASH, decisión de Jhon).
--   · drive_uso (personal) ya no cuenta lo que está dentro de una unidad.
--   · Solo un admin crea unidades (edge drive, acción crear_unidad).

DO $$
BEGIN
  IF (SELECT count(*) FROM public.tenants) <> 1 THEN
    RAISE EXCEPTION 'drive_unidades: se aplica con UNA sola agencia (KASH queda sin tope); hay %', (SELECT count(*) FROM public.tenants);
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'drive_items_cuidar' AND pronamespace = 'public'::regnamespace)
     IS DISTINCT FROM 'f205a051529845b3c16d26d7c8cb0cfc' THEN
    RAISE EXCEPTION 'drive_items_cuidar cambió en la base: revisar antes de reemplazarla';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'drive_uso' AND pronamespace = 'public'::regnamespace)
     IS DISTINCT FROM 'f3a463faf2000560f8d643faa5b8b090' THEN
    RAISE EXCEPTION 'drive_uso cambió en la base: revisar antes de reemplazarla';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'drive_usos_de_mi_agencia' AND pronamespace = 'public'::regnamespace)
     IS DISTINCT FROM '51b1495f3829d784d00fe26ce05c8b08' THEN
    RAISE EXCEPTION 'drive_usos_de_mi_agencia cambió en la base: revisar antes de reemplazarla';
  END IF;
END $$;

-- ── 1. Qué carpetas son unidades ────────────────────────────────────────────
CREATE TABLE public.drive_unidades (
  item_id    uuid PRIMARY KEY REFERENCES public.drive_items(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo       text NOT NULL CHECK (tipo IN ('empresa', 'personal')),
  persona    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (tipo = 'personal' OR persona IS NULL)
);
CREATE INDEX drive_unidades_persona_idx ON public.drive_unidades (persona) WHERE persona IS NOT NULL;
ALTER TABLE public.drive_unidades ENABLE ROW LEVEL SECURITY;
-- Se ve si se puede ver la carpeta (o si es MI «Mi unidad» de Google). Nadie
-- la escribe desde el navegador: la edge con service_role.
CREATE POLICY drive_unidades_ver ON public.drive_unidades FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id())
         AND (persona = (SELECT auth.uid()) OR public.drive_mi_rol(item_id) IS NOT NULL));
REVOKE ALL ON public.drive_unidades FROM anon;
GRANT SELECT ON public.drive_unidades TO authenticated;

-- Una unidad es una carpeta SIN dueño de la misma agencia; la persona de una
-- «Mi unidad» importada es de esa agencia.
CREATE OR REPLACE FUNCTION public.drive_unidades_cuidar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.drive_items i
                 WHERE i.id = NEW.item_id AND i.tipo = 'carpeta' AND i.owner_id IS NULL AND i.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Una unidad es una carpeta sin dueño de la misma agencia' USING ERRCODE = '23514';
  END IF;
  IF NEW.persona IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tenant_members m
                                             WHERE m.user_id = NEW.persona AND m.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'La persona de la unidad no es de esta agencia' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER drive_unidades_cuidar BEFORE INSERT OR UPDATE ON public.drive_unidades
  FOR EACH ROW EXECUTE FUNCTION public.drive_unidades_cuidar();

-- ── 2. A qué unidad pertenece cada ficha ────────────────────────────────────
ALTER TABLE public.drive_items ADD COLUMN unidad_id uuid;
CREATE INDEX drive_items_unidad_idx ON public.drive_items (tenant_id, unidad_id) WHERE unidad_id IS NOT NULL;

-- La unidad 'empresa' que contiene a p_item (subiendo por las madres), o null.
CREATE OR REPLACE FUNCTION public.drive_unidad_de(p_item uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE actual uuid := p_item; pasos int := 0;
BEGIN
  WHILE actual IS NOT NULL AND pasos <= 60 LOOP
    IF EXISTS (SELECT 1 FROM public.drive_unidades u WHERE u.item_id = actual AND u.tipo = 'empresa') THEN
      RETURN actual;
    END IF;
    SELECT parent_id INTO actual FROM public.drive_items WHERE id = actual;
    pasos := pasos + 1;
  END LOOP;
  RETURN NULL;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.drive_unidad_de(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.drive_unidad_de(uuid) TO service_role;

-- Al crear o mover: la unidad sale de la carpeta madre (o es ella misma).
CREATE OR REPLACE FUNCTION public.drive_items_unidad()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.unidad_id := CASE
    WHEN EXISTS (SELECT 1 FROM public.drive_unidades u WHERE u.item_id = NEW.id AND u.tipo = 'empresa') THEN NEW.id
    ELSE public.drive_unidad_de(NEW.parent_id)
  END;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER drive_items_unidad BEFORE INSERT OR UPDATE OF parent_id ON public.drive_items
  FOR EACH ROW EXECUTE FUNCTION public.drive_items_unidad();

-- Mover una carpeta arrastra a todo lo de adentro.
CREATE OR REPLACE FUNCTION public.drive_unidad_al_subarbol(p_raiz uuid, p_unidad uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH RECURSIVE arbol AS (
    SELECT id, 0 AS nivel FROM public.drive_items WHERE parent_id = p_raiz
    UNION ALL
    SELECT d.id, a.nivel + 1 FROM public.drive_items d JOIN arbol a ON d.parent_id = a.id WHERE a.nivel < 60
  )
  UPDATE public.drive_items SET unidad_id = p_unidad
  WHERE id IN (SELECT id FROM arbol) AND unidad_id IS DISTINCT FROM p_unidad;
$function$;
REVOKE EXECUTE ON FUNCTION public.drive_unidad_al_subarbol(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.drive_items_unidad_hijos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.tipo = 'carpeta' AND NEW.unidad_id IS DISTINCT FROM OLD.unidad_id THEN
    PERFORM public.drive_unidad_al_subarbol(NEW.id, NEW.unidad_id);
  END IF;
  RETURN NULL;
END;
$function$;
CREATE TRIGGER drive_items_unidad_hijos AFTER UPDATE OF parent_id ON public.drive_items
  FOR EACH ROW EXECUTE FUNCTION public.drive_items_unidad_hijos();

-- Marcar (o desmarcar) una carpeta como unidad 'empresa' rehace su árbol.
CREATE OR REPLACE FUNCTION public.drive_unidades_al_arbol()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE raiz uuid; unidad uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.tipo <> 'empresa' THEN RETURN NULL; END IF;
    raiz := OLD.item_id;
    unidad := public.drive_unidad_de((SELECT parent_id FROM public.drive_items WHERE id = OLD.item_id));
  ELSE
    IF NEW.tipo <> 'empresa' THEN RETURN NULL; END IF;
    raiz := NEW.item_id;
    unidad := NEW.item_id;
  END IF;
  UPDATE public.drive_items SET unidad_id = unidad WHERE id = raiz AND unidad_id IS DISTINCT FROM unidad;
  PERFORM public.drive_unidad_al_subarbol(raiz, unidad);
  RETURN NULL;
END;
$function$;
CREATE TRIGGER drive_unidades_al_arbol AFTER INSERT OR DELETE ON public.drive_unidades
  FOR EACH ROW EXECUTE FUNCTION public.drive_unidades_al_arbol();

-- ── 3. unidad_id no es una modificación: no toca «Última modificación» ──────
CREATE OR REPLACE FUNCTION public.drive_items_cuidar()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE actual uuid; pasos int := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT (auth.role() = 'service_role' AND NEW.updated_at IS NOT NULL) THEN
      NEW.updated_at := now();
    END IF;
  ELSIF auth.role() = 'service_role' AND NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    NULL;
  ELSIF (to_jsonb(NEW) - 'updated_at' - 'last_opened_at' - 'unidad_id') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at' - 'last_opened_at' - 'unidad_id') THEN
    NEW.updated_at := now();
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.tipo IS DISTINCT FROM OLD.tipo OR NEW.storage_key IS DISTINCT FROM OLD.storage_key
       OR NEW.size IS DISTINCT FROM OLD.size OR NEW.sha256 IS DISTINCT FROM OLD.sha256
       OR NEW.estado IS DISTINCT FROM OLD.estado OR NEW.mime IS DISTINCT FROM OLD.mime
       OR NEW.last_opened_at IS DISTINCT FROM OLD.last_opened_at THEN
      RAISE EXCEPTION 'Solo se puede cambiar el nombre, la carpeta o mandar a la papelera' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.parent_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.parent_id IS DISTINCT FROM OLD.parent_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.drive_items p WHERE p.id = NEW.parent_id AND p.tipo = 'carpeta' AND p.tenant_id = NEW.tenant_id) THEN
      RAISE EXCEPTION 'La carpeta de destino no existe' USING ERRCODE = '23503';
    END IF;
    IF public.drive_mi_rol(NEW.parent_id) NOT IN ('dueno', 'editor') THEN
      RAISE EXCEPTION 'No puedes guardar en esa carpeta' USING ERRCODE = '42501';
    END IF;
    actual := NEW.parent_id;
    WHILE actual IS NOT NULL LOOP
      IF actual = NEW.id THEN RAISE EXCEPTION 'Una carpeta no puede quedar dentro de sí misma' USING ERRCODE = '23514'; END IF;
      pasos := pasos + 1; EXIT WHEN pasos > 50;
      SELECT parent_id INTO actual FROM public.drive_items WHERE id = actual;
    END LOOP;
  END IF;
  RETURN NEW;
END; $function$;

-- ── 4. El espacio común de la agencia ───────────────────────────────────────
CREATE TABLE public.drive_espacio_agencia (
  tenant_id   uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  por_persona bigint CHECK (por_persona IS NULL OR por_persona >= 0),
  extra       bigint NOT NULL DEFAULT 0 CHECK (extra >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.drive_espacio_agencia ENABLE ROW LEVEL SECURITY;
CREATE POLICY drive_espacio_agencia_ver ON public.drive_espacio_agencia FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));
REVOKE ALL ON public.drive_espacio_agencia FROM anon;
GRANT SELECT ON public.drive_espacio_agencia TO authenticated;
-- KASH (la única agencia hoy): sin tope.
INSERT INTO public.drive_espacio_agencia (tenant_id, por_persona) SELECT id, NULL FROM public.tenants;

-- Como el plan Starter de Google: 30 GB por cada persona de la agencia.
CREATE OR REPLACE FUNCTION public.drive_espacio_por_persona_por_defecto()
RETURNS bigint LANGUAGE sql IMMUTABLE AS $function$ SELECT 30::bigint * 1024 * 1024 * 1024 $function$;

-- Lo usado y el tope (null = sin tope) del espacio común de MI agencia.
CREATE OR REPLACE FUNCTION public.drive_uso_agencia()
RETURNS TABLE(usado bigint, cupo bigint, personas integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  agencia uuid := public.current_tenant_id();
  n integer;
  e public.drive_espacio_agencia%ROWTYPE;
BEGIN
  IF agencia IS NULL THEN
    RAISE EXCEPTION 'No encontré tu agencia' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO n FROM public.tenant_members m WHERE m.tenant_id = agencia;
  SELECT * INTO e FROM public.drive_espacio_agencia x WHERE x.tenant_id = agencia;
  RETURN QUERY SELECT
    coalesce((SELECT sum(i.size) FROM public.drive_items i
              WHERE i.tenant_id = agencia AND i.unidad_id IS NOT NULL AND i.tipo = 'archivo'), 0)::bigint,
    CASE
      WHEN e.tenant_id IS NOT NULL AND e.por_persona IS NULL THEN NULL
      ELSE coalesce(e.por_persona, public.drive_espacio_por_persona_por_defecto()) * n + coalesce(e.extra, 0)
    END::bigint,
    n;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.drive_uso_agencia() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.drive_uso_agencia() TO authenticated, service_role;

-- ── 5. El cupo personal ya no cuenta lo que está dentro de una unidad ───────
CREATE OR REPLACE FUNCTION public.drive_uso(p_user uuid DEFAULT NULL::uuid)
 RETURNS TABLE(usado bigint, cupo bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  quien uuid := coalesce(p_user, auth.uid());
BEGIN
  IF quien <> auth.uid() AND NOT (
    public.drive_soy_admin()
    AND EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.user_id = quien AND m.tenant_id = public.current_tenant_id())
  ) THEN
    RAISE EXCEPTION 'No puedes ver el uso de otra persona' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    coalesce((SELECT sum(i.size) FROM public.drive_items i WHERE i.owner_id = quien AND i.tipo = 'archivo' AND i.unidad_id IS NULL), 0)::bigint,
    coalesce((SELECT c.bytes_max FROM public.drive_cupos c WHERE c.user_id = quien), public.drive_cupo_por_defecto());
END;
$function$;

CREATE OR REPLACE FUNCTION public.drive_usos_de_mi_agencia()
 RETURNS TABLE(user_id uuid, nombre text, usado bigint, cupo bigint, cupo_propio boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.drive_soy_admin() THEN
    RAISE EXCEPTION 'Solo para admins' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT m.user_id,
         coalesce(nullif(btrim(p.full_name), ''), u.email::text, ''),
         coalesce((SELECT sum(i.size) FROM public.drive_items i WHERE i.owner_id = m.user_id AND i.tipo = 'archivo' AND i.unidad_id IS NULL), 0)::bigint,
         coalesce(c.bytes_max, public.drive_cupo_por_defecto()),
         c.user_id IS NOT NULL
  FROM public.tenant_members m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  LEFT JOIN auth.users u ON u.id = m.user_id
  LEFT JOIN public.drive_cupos c ON c.user_id = m.user_id
  WHERE m.tenant_id = public.current_tenant_id()
  ORDER BY 3 DESC, 2;
END;
$function$;
