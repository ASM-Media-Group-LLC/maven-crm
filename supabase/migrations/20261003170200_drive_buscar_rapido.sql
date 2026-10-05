-- Drive: el buscador, rápido también con palabras comunes (Jhon, 03/10:
-- «img» tardaba ~4,8 s y «celia lora», 24 ms). Reemplaza drive_buscar
-- (20261002200100_drive_buscar.sql) con la MISMA firma y las mismas columnas.
--
-- QUÉ PASABA (medido en prod el 03/10 con EXPLAIN ANALYZE):
--   · «img» está en el nombre de ~143.000 de las 891.000 fichas (las fotos
--     IMG_1234.JPG). El índice trigram las encuentra en 16 ms, pero el
--     trigram no alcanza para decidir un LIKE: cada una se relee y se le pasa
--     unaccent (~7 µs por fila), y recién después se ordenan para quedarse con
--     400. ~1 s solo en eso.
--   · Sobre esas 400 se miraba quién puede verlas (drive_mi_rol, hasta ~2,5 ms
--     cada una): otro ~1 s. Y quien ve poco del Drive se quedaba sin
--     resultados aunque tuviera fotos: las 400 más nuevas eran de unidades que
--     no ve (una persona con una sola carpeta compartida: 0 resultados en 1,9 s).
--
-- AHORA, primero QUÉ PUEDE VER la persona y después el nombre:
--   · Lo que ve se arma al empezar, con pocas consultas: las unidades
--     compartidas que ve enteras (drive_mi_rol sobre la raíz de cada una: son
--     58), lo compartido con ella, lo abierto a la agencia, lo suyo, y las
--     carpetas que cuelgan de eso (fuera de esas unidades; por el índice
--     chico de carpetas, migración anterior). Con eso, «se puede ver» es una
--     condición más del WHERE, exacta (es lo mismo que mira drive_mi_rol:
--     dueño, compartido o abierto a la agencia en la ficha o en una carpeta de
--     arriba), y la base la resuelve con los índices de siempre.
--   · Después, según cuántas fichas tienen la palabra más RARA de lo buscado
--     (cada palabra de 3 letras o más se cuenta por el índice trigram, hasta
--     5000 y sin ordenar; antes iba por el índice la más larga, y en «contrato
--     celia» eso es «contrato», que está en miles):
--       1. Menos de 5000 (lo normal: un nombre, una persona, un mes): esas,
--          con todas las palabras, las que EMPIEZAN con lo buscado primero y
--          después las más nuevas, como antes. Con 50 o menos ni siquiera se
--          arma lo que ve: se mira cada una con drive_mi_rol, como antes.
--       2. 5000 o más y la persona ve hasta 30.000 fichas: se leen las suyas
--          (no las 891.000) y se ordenan igual.
--       3. 5000 o más y ve más de 30.000: se recorre lo que ve de lo más nuevo
--          a lo más viejo (índice por fecha, migración anterior) y se toman las
--          que tienen las palabras: con «img», 1 de cada 3, así que 50 salen de
--          las primeras ~150. Primero lo que empieza con lo buscado. Si en
--          0,15 s no llena el cupo (lo que ve con ese nombre es viejo o
--          escaso), se hace como antes: todas las de la palabra rara que ve,
--          ordenadas. Y directo así si son varias palabras y en la muestra de
--          5000 casi ninguna tiene todas («contrato v2»: «v2» es corta para el
--          índice).
--   · Cada resultado se confirma, como antes, con drive_mi_rol y con la
--     papelera de las carpetas de arriba (con memoria por carpeta): ningún
--     resultado sale sin que drive_mi_rol lo deje ver.
--   · Tope de 1,5 s (el statement_timeout de authenticated es 8 s): si se
--     llega, vuelve lo encontrado hasta ahí.
--   · plan_cache_mode = force_custom_plan: las listas (unidades, carpetas) entran
--     al plan como constantes, así la base las busca con una tabla hash y sabe
--     cuántas filas esperar, aunque la conexión ya haya corrido la función.
--
-- ⚠️ Requiere los dos índices de las migraciones anteriores (CONCURRENTLY,
-- aparte): sin ellos, el recorrido y la bajada por carpetas leerían de más.
-- Esta migración se niega a aplicarse si falta alguno.

DO $$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc
      WHERE oid = to_regprocedure('public.drive_buscar(text, text[], integer)'))
     IS DISTINCT FROM '7f8eb811b9f3d152c9645b5926c52ce8' THEN
    RAISE EXCEPTION 'drive_buscar cambió en la base: revisar antes de reemplazarla';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index
                 WHERE indexrelid = to_regclass('public.drive_items_modificado_idx') AND indisvalid) THEN
    RAISE EXCEPTION 'Falta el índice drive_items_modificado_idx (o quedó inválido): aplicar antes 20261003170100_drive_buscar_indice_por_fecha.sql, sola y fuera de una transacción';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index
                 WHERE indexrelid = to_regclass('public.drive_items_subcarpetas_idx') AND indisvalid) THEN
    RAISE EXCEPTION 'Falta el índice drive_items_subcarpetas_idx (o quedó inválido): aplicar antes 20261003170150_drive_buscar_indice_de_carpetas.sql, sola y fuera de una transacción';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.drive_buscar(p_q text, p_extensiones text[] DEFAULT NULL, p_limite integer DEFAULT 50)
RETURNS TABLE(
  id uuid, nombre text, tipo text, mime text, size bigint, updated_at timestamptz,
  owner_id uuid, parent_id uuid, ubicacion text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET plan_cache_mode = force_custom_plan
AS $function$
#variable_conflict use_column
DECLARE
  agencia uuid := public.current_tenant_id();
  yo uuid := auth.uid();
  q text := btrim(public.drive_nombre_buscable(coalesce(p_q, '')));
  q_inicio text;
  patrones text[];
  palabra text;
  ids uuid[];
  -- La palabra que va por el índice trigram (la más rara), o null si
  -- ninguna tiene 3 letras seguidas (el índice no ayuda).
  mas_rara text;
  exts text[];
  limite integer := least(greatest(coalesce(p_limite, 50), 1), 100);
  fin timestamptz := clock_timestamp() + interval '1.5 seconds';
  fin_recorrido timestamptz;
  -- Las de la palabra más rara, si son menos de 5000.
  candidatas uuid[];
  muchas boolean;
  fase text;
  c refcursor;
  r record;
  nombre_b text;
  empieza boolean;
  visibles integer;
  en_muestra integer;
  agotado boolean;
  -- Lo que la persona puede ver (null = no se armó: se mira cada una).
  con_acceso boolean := false;
  mis_raices uuid[];
  v_unidades uuid[];
  v_carpetas uuid[];
  -- La papelera de las carpetas de arriba, una vez por carpeta.
  vivas uuid[] := '{}';
  tiradas uuid[] := '{}';
  -- Lo encontrado: primero lo que empieza con lo buscado.
  con_inicio uuid[] := '{}';
  sin_inicio uuid[] := '{}';
BEGIN
  -- Sin sesión o sin agencia, nada. Con menos de 3 letras el índice trigram no
  -- sirve (y una letra encuentra medio Drive): el diálogo filtra lo que ve.
  IF agencia IS NULL OR yo IS NULL OR length(q) < 3 THEN
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
  q_inicio := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  IF p_extensiones IS NOT NULL THEN
    exts := ARRAY(SELECT lower(e) FROM unnest(p_extensiones) AS e);
  END IF;

  -- ¿Cuál es la palabra más rara? Cada una (de 3 letras seguidas o más: con
  -- menos el trigram no tiene qué buscar) se cuenta por el índice, hasta
  -- 5000 y sin ordenar (se corta al llegar). Se guardan las de la más rara.
  FOREACH palabra IN ARRAY patrones LOOP
    CONTINUE WHEN palabra !~ '[[:alnum:]]{3}';
    ids := ARRAY(
      SELECT i.id FROM public.drive_items i
      WHERE i.tenant_id = agencia
        AND i.trashed_at IS NULL
        AND (i.tipo = 'carpeta' OR i.estado = 'listo')
        AND public.drive_nombre_buscable(i.nombre) LIKE palabra
      LIMIT 5000
    );
    IF mas_rara IS NULL OR cardinality(ids) < cardinality(candidatas) THEN
      mas_rara := palabra;
      candidatas := ids;
    END IF;
    EXIT WHEN cardinality(candidatas) = 0;
  END LOOP;
  -- Sin palabra para el índice, como si fueran muchas: se mira lo que ve.
  muchas := mas_rara IS NULL OR cardinality(candidatas) >= 5000;

  -- Lo que la persona puede ver, si hace falta (más de 50 para mirar).
  IF muchas OR cardinality(candidatas) > 50 THEN
    con_acceso := true;
    -- Lo compartido con ella y lo abierto a toda la agencia.
    mis_raices := ARRAY(
      SELECT s.item_id FROM public.drive_shares s JOIN public.drive_items i ON i.id = s.item_id
       WHERE s.user_id = yo AND i.tenant_id = agencia AND i.trashed_at IS NULL
      UNION
      SELECT a.item_id FROM public.drive_compartido_agencia a JOIN public.drive_items i ON i.id = a.item_id
       WHERE i.tenant_id = agencia AND i.trashed_at IS NULL
    );
    -- Las unidades compartidas que ve enteras. La raíz de una unidad cuelga
    -- de otra carpeta (lo importado de Google): drive_mi_rol sube por ella.
    v_unidades := ARRAY(
      SELECT u.item_id FROM public.drive_unidades u
      WHERE u.tenant_id = agencia AND u.tipo = 'empresa' AND public.drive_mi_rol(u.item_id) IS NOT NULL
    );
    -- Las carpetas que ve fuera de esas unidades: las compartidas, las
    -- abiertas a la agencia y las suyas, con todas las de abajo (sin entrar
    -- en una unidad que ya ve entera ni en la papelera).
    v_carpetas := ARRAY(
      WITH RECURSIVE abajo AS (
        SELECT i.id FROM public.drive_items i
        WHERE i.tenant_id = agencia AND i.tipo = 'carpeta' AND i.trashed_at IS NULL
          AND (i.id = ANY (mis_raices) OR i.owner_id = yo)
          AND (i.unidad_id IS NULL OR NOT (i.unidad_id = ANY (v_unidades)))
        UNION
        SELECT h.id FROM public.drive_items h JOIN abajo a ON h.parent_id = a.id
        WHERE h.tenant_id = agencia AND h.tipo = 'carpeta' AND h.trashed_at IS NULL
          AND (h.unidad_id IS NULL OR NOT (h.unidad_id = ANY (v_unidades)))
      )
      SELECT abajo.id FROM abajo
    );
  END IF;

  IF NOT muchas THEN
    fase := 'todas';
  ELSE
    -- Muchas: ¿cuánto ve la persona? Hasta 30.001.
    SELECT count(*) INTO visibles FROM (
      SELECT 1 FROM public.drive_items i
      WHERE i.tenant_id = agencia AND i.trashed_at IS NULL
        AND (i.unidad_id = ANY (v_unidades) OR i.parent_id = ANY (v_carpetas)
             OR i.id = ANY (mis_raices) OR i.owner_id = yo)
      LIMIT 30001
    ) s;
    IF visibles <= 30000 THEN
      fase := 'suyas';
    ELSE
      fase := 'recientes';
      -- Con más de una palabra puede que la rara sea común pero el conjunto
      -- no («contrato v2»): si en la muestra de 5000 hay menos de un cupo con
      -- todas, el recorrido por fecha casi no encontraría nada. Entonces, como
      -- antes: todas las de la palabra rara, ordenadas.
      IF mas_rara IS NOT NULL AND cardinality(patrones) > 1 THEN
        SELECT count(*) INTO en_muestra FROM public.drive_items i
        WHERE i.id = ANY (candidatas) AND public.drive_nombre_buscable(i.nombre) LIKE ALL (patrones);
        IF en_muestra < limite THEN
          fase := 'ordenadas';
        END IF;
      END IF;
    END IF;
  END IF;

  LOOP
    -- ⚠️ OPEN (y no FOR … IN): el plan de un cursor se arma para traer las
    -- primeras filas rápido, que es lo que hace usar el índice por fecha en el
    -- recorrido de 'recientes' en vez de leer y ordenar todo.
    IF fase = 'todas' THEN
      -- 1. Las de la palabra más rara (menos de 5000) que tienen todas las
      -- palabras, en el orden de siempre.
      OPEN c FOR
        SELECT i.id, i.nombre, i.tipo, i.estado, i.parent_id,
               public.drive_nombre_buscable(i.nombre) LIKE q_inicio AS empieza
        FROM public.drive_items i
        WHERE i.id = ANY (candidatas)
          AND i.trashed_at IS NULL
          AND (i.tipo = 'carpeta' OR i.estado = 'listo')
          AND public.drive_nombre_buscable(i.nombre) LIKE ALL (patrones)
          AND (exts IS NULL OR i.tipo = 'carpeta'
               OR lower(substring(i.nombre FROM '\.([A-Za-z0-9]+)$')) = ANY (exts))
          AND (NOT con_acceso
               OR i.unidad_id = ANY (v_unidades) OR i.parent_id = ANY (v_carpetas)
               OR i.id = ANY (mis_raices) OR i.owner_id = yo)
        ORDER BY 6 DESC, i.updated_at DESC;
    ELSIF fase = 'ordenadas' THEN
      -- 3c. Ve mucho y lo buscado entero es raro: todas las de la palabra
      -- rara que ve, en el orden de siempre (lo que hacía la función de antes).
      OPEN c FOR
        SELECT i.id, i.nombre, i.tipo, i.estado, i.parent_id,
               public.drive_nombre_buscable(i.nombre) LIKE q_inicio AS empieza
        FROM public.drive_items i
        WHERE i.tenant_id = agencia
          AND i.trashed_at IS NULL
          AND (i.tipo = 'carpeta' OR i.estado = 'listo')
          AND public.drive_nombre_buscable(i.nombre) LIKE mas_rara
          AND public.drive_nombre_buscable(i.nombre) LIKE ALL (patrones)
          AND (exts IS NULL OR i.tipo = 'carpeta'
               OR lower(substring(i.nombre FROM '\.([A-Za-z0-9]+)$')) = ANY (exts))
          AND (i.unidad_id = ANY (v_unidades) OR i.parent_id = ANY (v_carpetas)
               OR i.id = ANY (mis_raices) OR i.owner_id = yo)
        ORDER BY 6 DESC, i.updated_at DESC;
    ELSIF fase = 'suyas' THEN
      -- 2. Ve poco: lo suyo que tiene las palabras, en el orden de siempre.
      OPEN c FOR
        SELECT i.id, i.nombre, i.tipo, i.estado, i.parent_id,
               public.drive_nombre_buscable(i.nombre) LIKE q_inicio AS empieza
        FROM public.drive_items i
        WHERE i.tenant_id = agencia AND i.trashed_at IS NULL
          AND (i.tipo = 'carpeta' OR i.estado = 'listo')
          AND (i.unidad_id = ANY (v_unidades) OR i.parent_id = ANY (v_carpetas)
               OR i.id = ANY (mis_raices) OR i.owner_id = yo)
          AND public.drive_nombre_buscable(i.nombre) LIKE ALL (patrones)
          AND (exts IS NULL OR i.tipo = 'carpeta'
               OR lower(substring(i.nombre FROM '\.([A-Za-z0-9]+)$')) = ANY (exts))
        ORDER BY 6 DESC, i.updated_at DESC;
    ELSIF fase = 'recientes' THEN
      -- 3. Ve mucho: lo que ve, de lo más nuevo a lo más viejo; el nombre se
      -- mira en el bucle (empieza = null: «revisar el nombre aquí»). El LIMIT
      -- es un techo; lo que corta es el tiempo (fin_recorrido): 0,15 s si
      -- después están las ordenadas (3c) para completar; 0,6 s si no hay
      -- palabra para el índice y esto es todo.
      fin_recorrido := least(fin, clock_timestamp()
        + CASE WHEN mas_rara IS NULL THEN interval '0.6 seconds' ELSE interval '0.15 seconds' END);
      OPEN c FOR
        SELECT i.id, i.nombre, i.tipo, i.estado, i.parent_id, NULL::boolean AS empieza
        FROM public.drive_items i
        WHERE i.tenant_id = agencia AND i.trashed_at IS NULL
          AND (i.unidad_id = ANY (v_unidades) OR i.parent_id = ANY (v_carpetas)
               OR i.id = ANY (mis_raices) OR i.owner_id = yo)
        ORDER BY i.updated_at DESC
        LIMIT 300000;
    END IF;

    agotado := false;
    LOOP
      FETCH c INTO r;
      IF NOT FOUND THEN
        agotado := true;
        EXIT;
      END IF;
      EXIT WHEN clock_timestamp() > fin
        OR (fase = 'recientes' AND clock_timestamp() > fin_recorrido);

      -- En el recorrido, el nombre recién ahora.
      IF r.empieza IS NULL THEN
        CONTINUE WHEN NOT (r.tipo = 'carpeta' OR r.estado = 'listo');
        nombre_b := public.drive_nombre_buscable(r.nombre);
        CONTINUE WHEN NOT (nombre_b LIKE ALL (patrones));
        CONTINUE WHEN exts IS NOT NULL AND r.tipo <> 'carpeta'
          AND NOT coalesce(lower(substring(r.nombre FROM '\.([A-Za-z0-9]+)$')) = ANY (exts), false);
        empieza := nombre_b LIKE q_inicio;
      ELSE
        empieza := r.empieza;
      END IF;
      -- Lo que no empieza con lo buscado solo hace falta para completar.
      CONTINUE WHEN NOT empieza AND cardinality(sin_inicio) >= limite - cardinality(con_inicio);

      -- Lo que está dentro de una carpeta en la papelera también está en la
      -- papelera (la papelera marca solo la carpeta de arriba).
      IF r.parent_id IS NOT NULL THEN
        CONTINUE WHEN r.parent_id = ANY (tiradas);
        IF NOT (r.parent_id = ANY (vivas)) THEN
          IF EXISTS (
            WITH RECURSIVE arriba AS (
              SELECT p.id AS cid, p.parent_id AS madre, p.trashed_at AS tirada, 1 AS nivel
              FROM public.drive_items p WHERE p.id = r.parent_id
              UNION ALL
              SELECT p.id, p.parent_id, p.trashed_at, a.nivel + 1
              FROM public.drive_items p JOIN arriba a ON p.id = a.madre
              WHERE a.nivel < 50
            )
            SELECT 1 FROM arriba WHERE arriba.tirada IS NOT NULL
          ) THEN
            tiradas := tiradas || r.parent_id;
            CONTINUE;
          END IF;
          vivas := vivas || r.parent_id;
        END IF;
      END IF;

      -- El juez de siempre, sobre la ficha misma: nada sale sin él.
      CONTINUE WHEN public.drive_mi_rol(r.id) IS NULL;

      IF empieza THEN
        con_inicio := con_inicio || r.id;
      ELSE
        sin_inicio := sin_inicio || r.id;
      END IF;
      -- Ordenadas (1 y 2): con el cupo lleno, listo. En el recorrido se sigue
      -- hasta tener el cupo de las que empiezan con lo buscado (las demás ya
      -- quedaron guardadas si hacían falta).
      EXIT WHEN cardinality(con_inicio) >= limite
        OR (fase <> 'recientes' AND cardinality(con_inicio) + cardinality(sin_inicio) >= limite);
    END LOOP;
    CLOSE c;

    -- El recorrido se quedó corto de tiempo sin llenar el cupo (lo que la
    -- persona tiene con ese nombre es viejo o escaso): las ordenadas (3c), que
    -- son todas, en el orden de siempre, en vez de lo que juntó el recorrido.
    -- Si recorrió todo lo que ve, o no hay palabra para el índice (las
    -- ordenadas leerían la tabla entera), queda lo del recorrido.
    EXIT WHEN fase <> 'recientes' OR agotado OR mas_rara IS NULL
      OR cardinality(con_inicio) + cardinality(sin_inicio) >= limite
      OR clock_timestamp() > fin;
    fase := 'ordenadas';
    con_inicio := '{}';
    sin_inicio := '{}';
  END LOOP;

  RETURN QUERY
  SELECT i.id, i.nombre, i.tipo, i.mime, i.size, i.updated_at, i.owner_id, i.parent_id,
         -- Dónde está, para mostrarlo debajo del nombre (la carpeta madre).
         (SELECT p.nombre FROM public.drive_items p WHERE p.id = i.parent_id)
  FROM unnest(con_inicio || sin_inicio) WITH ORDINALITY AS e(eid, n)
  JOIN public.drive_items i ON i.id = e.eid
  ORDER BY e.n
  LIMIT limite;
END;
$function$;

-- CREATE OR REPLACE conserva los permisos; se repiten por claridad.
REVOKE ALL ON FUNCTION public.drive_buscar(text, text[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.drive_buscar(text, text[], integer) TO authenticated;

-- Vuelta atrás: la versión de 20261002200100_drive_buscar.sql, tal cual (la
-- prueba comprueba que vuelve con la huella de prod). El índice por fecha se
-- puede dejar; si se quiere sacar: DROP INDEX CONCURRENTLY, aparte.
--| CREATE OR REPLACE FUNCTION public.drive_buscar(p_q text, p_extensiones text[] DEFAULT NULL, p_limite integer DEFAULT 50)
--| RETURNS TABLE(
--|   id uuid, nombre text, tipo text, mime text, size bigint, updated_at timestamptz,
--|   owner_id uuid, parent_id uuid, ubicacion text
--| )
--| LANGUAGE plpgsql
--| STABLE
--| SECURITY DEFINER
--| SET search_path = public
--| AS $function$
--| #variable_conflict use_column
--| DECLARE
--|   agencia uuid := public.current_tenant_id();
--|   q text := btrim(public.drive_nombre_buscable(coalesce(p_q, '')));
--|   patrones text[];
--|   mas_largo text;
--|   exts text[];
--|   limite integer := least(greatest(coalesce(p_limite, 50), 1), 100);
--|   r record;
--|   n integer := 0;
--|   en_papelera boolean;
--| BEGIN
--|   -- Sin sesión o sin agencia, nada. Con menos de 3 letras el índice trigram no
--|   -- sirve (y una letra encuentra medio Drive): el diálogo filtra lo que ve.
--|   IF agencia IS NULL OR auth.uid() IS NULL OR length(q) < 3 THEN
--|     RETURN;
--|   END IF;
--|
--|   -- Cada palabra tiene que estar, en cualquier orden (como Google): «balance
--|   -- kash» encuentra «KASH · Balance 2026». Los comodines de LIKE se escapan.
--|   patrones := ARRAY(
--|     SELECT DISTINCT '%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%'
--|     FROM regexp_split_to_table(q, '\s+') AS w
--|     WHERE w <> ''
--|     LIMIT 8
--|   );
--|   IF coalesce(array_length(patrones, 1), 0) = 0 THEN
--|     RETURN;
--|   END IF;
--|   -- La palabra más larga es la que va por el índice; las demás se revisan.
--|   SELECT x INTO mas_largo FROM unnest(patrones) AS x ORDER BY length(x) DESC LIMIT 1;
--|   IF p_extensiones IS NOT NULL THEN
--|     exts := ARRAY(SELECT lower(e) FROM unnest(p_extensiones) AS e);
--|   END IF;
--|
--|   FOR r IN
--|     SELECT i.id, i.nombre, i.tipo, i.mime, i.size, i.updated_at, i.owner_id, i.parent_id
--|     FROM public.drive_items i
--|     WHERE i.tenant_id = agencia
--|       AND i.trashed_at IS NULL
--|       AND (i.tipo = 'carpeta' OR i.estado = 'listo')
--|       AND public.drive_nombre_buscable(i.nombre) LIKE mas_largo
--|       AND public.drive_nombre_buscable(i.nombre) LIKE ALL (patrones)
--|       AND (exts IS NULL OR i.tipo = 'carpeta'
--|            OR lower(substring(i.nombre FROM '\.([A-Za-z0-9]+)$')) = ANY (exts))
--|     -- Primero lo que EMPIEZA con lo buscado; después, lo más nuevo.
--|     ORDER BY (public.drive_nombre_buscable(i.nombre) LIKE replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%') DESC,
--|              i.updated_at DESC
--|     LIMIT 400
--|   LOOP
--|     -- La visibilidad, recién ahora y solo sobre los candidatos.
--|     CONTINUE WHEN public.drive_mi_rol(r.id) IS NULL;
--|
--|     -- Lo que está dentro de una carpeta en la papelera también está en la
--|     -- papelera (la papelera marca solo la carpeta de arriba).
--|     en_papelera := EXISTS (
--|       WITH RECURSIVE arriba AS (
--|         SELECT p.id AS cid, p.parent_id AS madre, p.trashed_at AS tirada, 1 AS nivel
--|         FROM public.drive_items p WHERE p.id = r.parent_id
--|         UNION ALL
--|         SELECT p.id, p.parent_id, p.trashed_at, a.nivel + 1
--|         FROM public.drive_items p JOIN arriba a ON p.id = a.madre
--|         WHERE a.nivel < 50
--|       )
--|       SELECT 1 FROM arriba WHERE arriba.tirada IS NOT NULL
--|     );
--|     CONTINUE WHEN en_papelera;
--|
--|     id := r.id;
--|     nombre := r.nombre;
--|     tipo := r.tipo;
--|     mime := r.mime;
--|     size := r.size;
--|     updated_at := r.updated_at;
--|     owner_id := r.owner_id;
--|     parent_id := r.parent_id;
--|     -- Dónde está, para mostrarlo debajo del nombre (la carpeta madre).
--|     ubicacion := (SELECT p.nombre FROM public.drive_items p WHERE p.id = r.parent_id);
--|     RETURN NEXT;
--|     n := n + 1;
--|     EXIT WHEN n >= limite;
--|   END LOOP;
--| END;
--| $function$;
