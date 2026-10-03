-- Drive: la PAPELERA como la de Google y el TAMAÑO de una carpeta (Jhon, 03/10).
--
-- 1. QUIÉN MANDÓ CADA COSA A LA PAPELERA (drive_items.trashed_by).
--    Hasta hoy la papelera listaba solo `owner_id = yo`. Lo importado de Google
--    no tiene dueño (owner_id null): quien lo tiraba lo perdía de vista y NADIE
--    podía restaurarlo (en prod, 97 archivos y 8 carpetas el 03/10). Ahora la
--    papelera de la pantalla es todo lo tirado que la persona puede ver (la RLS
--    de drive_items ya filtra por drive_mi_rol), como la papelera de una unidad
--    compartida de Google, que la ven sus miembros. Esta columna dice quién lo
--    tiró («Eliminado por»).
--
--    La pone un trigger PROPIO, chico; drive_items_cuidar no se toca:
--      · trashed_at pasa de null a una fecha → auth.uid() (la edge, que entra
--        con service_role y sin auth.uid(), puede decir quién fue);
--      · trashed_at vuelve a null (restaurar) → null;
--      · cualquier otro cambio → la de antes: nadie la escribe a mano.
--    Se llama drive_items_borrado_por para correr ANTES que drive_items_cuidar
--    (los triggers BEFORE de una tabla corren por orden alfabético): cuidar
--    compara la fila entera para decidir si cambia «Última modificación», y así
--    la ve ya acomodada (un trashed_by escrito a mano no cuenta como cambio).
--
--    ⚠️ Lo que ya estaba en la papelera queda con trashed_by null (no se sabe
--    quién lo tiró). Se muestra igual, con «—».
--
-- 2. EL TAMAÑO DE LAS CARPETAS («las carpetas siguen sin aparecer con su
--    tamaño», Jhon 03/10). Dos funciones para el navegador y una interna que
--    hace la cuenta:
--      · drive_sumar_carpeta(id, agencia, hasta) — INTERNA (nadie de afuera la
--        puede llamar): bytes, archivos y carpetas debajo de una carpeta, de a
--        un nivel por vez con el índice de hijos (drive_items_hijos_idx:
--        tenant_id, parent_id, sin papelera), hasta 60 niveles o la hora
--        `hasta`; si se corta, completo = false.
--      · drive_tamano_carpeta(id) — el panel de Detalles: UNA carpeta, con
--        error si no la puedes ver. Hasta ~4 s.
--      · drive_tamanos(ids) — la columna «Tamaño» de la lista y las tarjetas:
--        hasta 100 carpetas por llamada (las que se están dibujando). Las que
--        la persona no puede ver no vuelven (sin error: la lista las pide en
--        tanda). Cada carpeta tiene hasta ~2,5 s y la tanda deja de empezar
--        carpetas nuevas a los ~3 s: las que no alcanzó NO vuelven y el
--        navegador las pide en la tanda siguiente. Así ninguna llamada llega al
--        statement_timeout del rol authenticated (8 s en Supabase); un SET
--        dentro de la función no le cambiaría el tope a la sentencia que ya
--        está corriendo.
--    SECURITY DEFINER las dos públicas porque saltan la RLS (que evaluaría
--    drive_mi_rol fila por fila): por eso exigen ADENTRO la agencia, la sesión
--    y que la persona pueda ver la carpeta (drive_mi_rol), y entonces cuentan
--    todo lo de adentro, que es justo lo que ve (compartir una carpeta comparte
--    lo de adentro). No cuentan lo que está en la papelera (ni lo de adentro de
--    una carpeta tirada) ni las subidas a medias: lo mismo que se ve al abrir.
--
--    ⚠️ POR QUÉ SE CALCULA AL PEDIRLO Y NO HAY UN TOTAL GUARDADO. Medido el
--    03/10 en PGlite con la forma de prod (908.000 fichas, 97 unidades, la más
--    grande con 140.000 archivos en 2.800 carpetas): la unidad de 140.000
--    archivos tarda ~40 ms; las 97 unidades de una vez (TODA la tabla), ~0,5 s;
--    100 subcarpetas de la grande, ~0,2 s. Lejos del segundo que justificaría
--    una tabla de totales, que habría que mantener en cada subida, borrado,
--    movida y papelera (con triggers sobre la tabla más escrita del Drive) o
--    mostrar viejos. En prod, con el disco frío, puede tardar más: para eso
--    están los topes de tiempo de arriba, y el navegador guarda cada tanda
--    unos minutos (react-query) y la vuelve a pedir cuando algo cambia.

-- ── 1. Quién lo mandó a la papelera ─────────────────────────────────────────
ALTER TABLE public.drive_items
  ADD COLUMN trashed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.drive_items.trashed_by IS
  'Quién mandó la ficha a la papelera («Eliminado por»). La pone el trigger drive_items_borrado_por; null si no está en la papelera o si se tiró antes del 03/10/2026.';

CREATE OR REPLACE FUNCTION public.drive_items_borrado_por()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.trashed_at IS NULL THEN
    NEW.trashed_by := NULL;
  ELSIF TG_OP = 'INSERT' OR OLD.trashed_at IS NULL THEN
    NEW.trashed_by := coalesce(auth.uid(), NEW.trashed_by);
  ELSE
    NEW.trashed_by := OLD.trashed_by;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.drive_items_borrado_por() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER drive_items_borrado_por
  BEFORE INSERT OR UPDATE OF trashed_at, trashed_by ON public.drive_items
  FOR EACH ROW EXECUTE FUNCTION public.drive_items_borrado_por();

-- ── 2. Cuánto ocupa una carpeta ─────────────────────────────────────────────
-- CREATE (sin OR REPLACE) las tres: si ya existiera una con ese nombre, falla
-- en vez de pisarla.

-- La cuenta. INTERNA: no mira permisos (lo hacen las dos de abajo, que son las
-- únicas que la llaman), así que nadie más la puede ejecutar.
CREATE FUNCTION public.drive_sumar_carpeta(p_item uuid, p_agencia uuid, p_hasta timestamptz)
RETURNS TABLE(bytes bigint, archivos bigint, carpetas bigint, completo boolean)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $function$
DECLARE
  nivel uuid[] := ARRAY[p_item];
  siguiente uuid[];
  vueltas integer := 0;
  b bigint;
  a bigint;
  c bigint;
BEGIN
  bytes := 0;
  archivos := 0;
  carpetas := 0;
  completo := true;
  WHILE cardinality(nivel) > 0 LOOP
    IF vueltas >= 60 OR clock_timestamp() > p_hasta THEN
      completo := false;
      EXIT;
    END IF;
    vueltas := vueltas + 1;
    SELECT coalesce(sum(i.size) FILTER (WHERE i.tipo = 'archivo' AND i.estado = 'listo'), 0),
           count(*) FILTER (WHERE i.tipo = 'archivo' AND i.estado = 'listo'),
           count(*) FILTER (WHERE i.tipo = 'carpeta'),
           coalesce(array_agg(i.id) FILTER (WHERE i.tipo = 'carpeta'), '{}'::uuid[])
      INTO b, a, c, siguiente
      FROM public.drive_items i
     WHERE i.tenant_id = p_agencia
       AND i.parent_id = ANY (nivel)
       AND i.trashed_at IS NULL;
    bytes := bytes + b;
    archivos := archivos + a;
    carpetas := carpetas + c;
    nivel := siguiente;
  END LOOP;
  RETURN NEXT;
END;
$function$;
REVOKE ALL ON FUNCTION public.drive_sumar_carpeta(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- El panel de Detalles: una carpeta.
CREATE FUNCTION public.drive_tamano_carpeta(p_item uuid)
RETURNS TABLE(bytes bigint, archivos bigint, carpetas bigint, completo boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  agencia uuid := public.current_tenant_id();
BEGIN
  -- Sin sesión, sin agencia o sin acceso a la carpeta: nada (ni siquiera si
  -- existe).
  IF agencia IS NULL OR auth.uid() IS NULL OR public.drive_mi_rol(p_item) IS NULL THEN
    RAISE EXCEPTION 'No tienes acceso a esa carpeta' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.drive_items i WHERE i.id = p_item AND i.tipo = 'carpeta') THEN
    RAISE EXCEPTION 'No es una carpeta' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT s.bytes, s.archivos, s.carpetas, s.completo
  FROM public.drive_sumar_carpeta(p_item, agencia, clock_timestamp() + interval '4 seconds') s;
END;
$function$;
REVOKE ALL ON FUNCTION public.drive_tamano_carpeta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.drive_tamano_carpeta(uuid) TO authenticated;

-- La lista y las tarjetas: hasta 100 carpetas por llamada, en el orden pedido.
CREATE FUNCTION public.drive_tamanos(p_ids uuid[])
RETURNS TABLE(item_id uuid, bytes bigint, archivos bigint, carpetas bigint, completo boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  agencia uuid := public.current_tenant_id();
  fin_de_tanda timestamptz := clock_timestamp() + interval '3 seconds';
  r record;
  s record;
BEGIN
  IF agencia IS NULL OR auth.uid() IS NULL OR p_ids IS NULL THEN
    RETURN;
  END IF;
  IF cardinality(p_ids) > 100 THEN
    RAISE EXCEPTION 'Se piden de a 100 carpetas como mucho' USING ERRCODE = '22023';
  END IF;
  FOR r IN
    SELECT i.id
    FROM public.drive_items i
    WHERE i.id = ANY (p_ids) AND i.tenant_id = agencia AND i.tipo = 'carpeta'
    ORDER BY array_position(p_ids, i.id)
  LOOP
    -- Las que no se alcanzan a empezar no vuelven: el navegador las vuelve a pedir.
    EXIT WHEN clock_timestamp() > fin_de_tanda;
    CONTINUE WHEN public.drive_mi_rol(r.id) IS NULL;
    SELECT * INTO s FROM public.drive_sumar_carpeta(r.id, agencia, clock_timestamp() + interval '2.5 seconds');
    item_id := r.id;
    bytes := s.bytes;
    archivos := s.archivos;
    carpetas := s.carpetas;
    completo := s.completo;
    RETURN NEXT;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.drive_tamanos(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.drive_tamanos(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.drive_tamano_carpeta(uuid) IS
  'Detalles del Drive: bytes, archivos y carpetas dentro de una carpeta que la persona puede ver (sin papelera ni subidas a medias). completo = false si se cortó (60 niveles o ~4 s).';
COMMENT ON FUNCTION public.drive_tamanos(uuid[]) IS
  'Columna Tamaño del Drive: lo mismo que drive_tamano_carpeta para hasta 100 carpetas. Las que no se pueden ver o no se alcanzaron (~3 s por tanda) no vuelven.';

--| DROP FUNCTION IF EXISTS public.drive_tamanos(uuid[]);
--| DROP FUNCTION IF EXISTS public.drive_tamano_carpeta(uuid);
--| DROP FUNCTION IF EXISTS public.drive_sumar_carpeta(uuid, uuid, timestamptz);
--| DROP TRIGGER IF EXISTS drive_items_borrado_por ON public.drive_items;
--| DROP FUNCTION IF EXISTS public.drive_items_borrado_por();
--| ALTER TABLE public.drive_items DROP COLUMN IF EXISTS trashed_by;
