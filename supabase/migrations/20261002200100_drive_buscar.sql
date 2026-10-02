-- Drive: BUSCAR EN TODO el Drive que la persona puede ver, por nombre, sin
-- mayúsculas ni tildes, como el buscador de Google (Jhon, 02/10). Lo usa el
-- diálogo «Abrir un archivo» de la Oficina.
--
-- POR QUÉ UNA FUNCIÓN Y NO UN `ilike` DESDE EL NAVEGADOR: drive_items tiene
-- ~430.000 fichas (lo importado de Google) y su RLS llama a drive_mi_rol —que
-- sube por las carpetas— FILA POR FILA, y lo hace ANTES del `ilike` (la RLS va
-- primero porque `ilike` no es leakproof). Un buscador así recorría el árbol
-- de cientos de miles de fichas en cada tecla.
--
-- Aquí, al revés: primero los CANDIDATOS por nombre (índice trigram, en la
-- migración siguiente), de la agencia, sin papelera, a lo sumo 400, y recién
-- sobre esos la visibilidad (drive_mi_rol) y la papelera de las carpetas de
-- arriba, hasta juntar `p_limite`. SECURITY DEFINER porque salta la RLS: la
-- agencia y la visibilidad se exigen ADENTRO.
--
-- No reemplaza nada: CREATE FUNCTION (sin OR REPLACE) falla si ya existiera.

DO $$
BEGIN
  IF to_regprocedure('extensions.unaccent(regdictionary, text)') IS NULL THEN
    RAISE EXCEPTION 'Falta la extensión unaccent en el esquema extensions';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_opclass c JOIN pg_namespace n ON n.oid = c.opcnamespace
                 WHERE c.opcname = 'gin_trgm_ops' AND n.nspname = 'extensions') THEN
    RAISE EXCEPTION 'Falta pg_trgm (gin_trgm_ops) en el esquema extensions';
  END IF;
END $$;

-- El nombre como se busca: minúsculas y sin tildes. `unaccent` NO es
-- IMMUTABLE (depende del diccionario), así que no sirve en un índice; esta
-- envoltura sí, con el diccionario fijo y el esquema escrito (el truco de
-- siempre). ⚠️ El índice y la búsqueda tienen que usar ESTA MISMA función:
-- con otra expresión el índice no se usa.
CREATE FUNCTION public.drive_nombre_buscable(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE STRICT
SET search_path = ''
AS $function$
  SELECT lower(extensions.unaccent('extensions.unaccent'::regdictionary, p))
$function$;

CREATE FUNCTION public.drive_buscar(p_q text, p_extensiones text[] DEFAULT NULL, p_limite integer DEFAULT 50)
RETURNS TABLE(
  id uuid, nombre text, tipo text, mime text, size bigint, updated_at timestamptz,
  owner_id uuid, parent_id uuid, ubicacion text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
#variable_conflict use_column
DECLARE
  agencia uuid := public.current_tenant_id();
  q text := btrim(public.drive_nombre_buscable(coalesce(p_q, '')));
  patrones text[];
  mas_largo text;
  exts text[];
  limite integer := least(greatest(coalesce(p_limite, 50), 1), 100);
  r record;
  n integer := 0;
  en_papelera boolean;
BEGIN
  -- Sin sesión o sin agencia, nada. Con menos de 3 letras el índice trigram no
  -- sirve (y una letra encuentra medio Drive): el diálogo filtra lo que ve.
  IF agencia IS NULL OR auth.uid() IS NULL OR length(q) < 3 THEN
    RETURN;
  END IF;

  -- Cada palabra tiene que estar, en cualquier orden (como Google): «balance
  -- kash» encuentra «KASH · Balance 2026». Los comodines de LIKE se escapan.
  patrones := ARRAY(
    SELECT DISTINCT '%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    FROM regexp_split_to_table(q, '\s+') AS w
    WHERE w <> ''
    LIMIT 8
  );
  IF coalesce(array_length(patrones, 1), 0) = 0 THEN
    RETURN;
  END IF;
  -- La palabra más larga es la que va por el índice; las demás se revisan.
  SELECT x INTO mas_largo FROM unnest(patrones) AS x ORDER BY length(x) DESC LIMIT 1;
  IF p_extensiones IS NOT NULL THEN
    exts := ARRAY(SELECT lower(e) FROM unnest(p_extensiones) AS e);
  END IF;

  FOR r IN
    SELECT i.id, i.nombre, i.tipo, i.mime, i.size, i.updated_at, i.owner_id, i.parent_id
    FROM public.drive_items i
    WHERE i.tenant_id = agencia
      AND i.trashed_at IS NULL
      AND (i.tipo = 'carpeta' OR i.estado = 'listo')
      AND public.drive_nombre_buscable(i.nombre) LIKE mas_largo
      AND public.drive_nombre_buscable(i.nombre) LIKE ALL (patrones)
      AND (exts IS NULL OR i.tipo = 'carpeta'
           OR lower(substring(i.nombre FROM '\.([A-Za-z0-9]+)$')) = ANY (exts))
    -- Primero lo que EMPIEZA con lo buscado; después, lo más nuevo.
    ORDER BY (public.drive_nombre_buscable(i.nombre) LIKE replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%') DESC,
             i.updated_at DESC
    LIMIT 400
  LOOP
    -- La visibilidad, recién ahora y solo sobre los candidatos.
    CONTINUE WHEN public.drive_mi_rol(r.id) IS NULL;

    -- Lo que está dentro de una carpeta en la papelera también está en la
    -- papelera (la papelera marca solo la carpeta de arriba).
    en_papelera := EXISTS (
      WITH RECURSIVE arriba AS (
        SELECT p.id AS cid, p.parent_id AS madre, p.trashed_at AS tirada, 1 AS nivel
        FROM public.drive_items p WHERE p.id = r.parent_id
        UNION ALL
        SELECT p.id, p.parent_id, p.trashed_at, a.nivel + 1
        FROM public.drive_items p JOIN arriba a ON p.id = a.madre
        WHERE a.nivel < 50
      )
      SELECT 1 FROM arriba WHERE arriba.tirada IS NOT NULL
    );
    CONTINUE WHEN en_papelera;

    id := r.id;
    nombre := r.nombre;
    tipo := r.tipo;
    mime := r.mime;
    size := r.size;
    updated_at := r.updated_at;
    owner_id := r.owner_id;
    parent_id := r.parent_id;
    -- Dónde está, para mostrarlo debajo del nombre (la carpeta madre).
    ubicacion := (SELECT p.nombre FROM public.drive_items p WHERE p.id = r.parent_id);
    RETURN NEXT;
    n := n + 1;
    EXIT WHEN n >= limite;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.drive_buscar(text, text[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.drive_buscar(text, text[], integer) TO authenticated;
-- La envoltura queda ejecutable por todos a propósito: es pura (minúsculas
-- sin tildes) y la evalúa el índice al insertar o renombrar fichas, lo haga
-- quien lo haga.

--| DROP FUNCTION IF EXISTS public.drive_buscar(text, text[], integer);
--| DROP FUNCTION IF EXISTS public.drive_nombre_buscable(text);  -- después del índice (migración siguiente)
