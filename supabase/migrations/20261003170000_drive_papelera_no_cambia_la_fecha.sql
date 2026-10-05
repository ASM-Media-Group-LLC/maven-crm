-- Drive: mandar a la papelera (o restaurar) NO cambia «Última modificación»,
-- como en Google (Jhon, 03/10).
--
-- drive_items_cuidar decide la fecha comparando la fila entera menos
-- updated_at, last_opened_at y unidad_id: cualquier otra diferencia es «una
-- modificación» y pone updated_at := now(). trashed_at (y trashed_by, que pone
-- drive_items_borrado_por) entraban en esa comparación, así que tirar algo a
-- la papelera le ponía la fecha de hoy, y al restaurarlo volvía a cambiar.
-- Medido en prod el 03/10: de las 107 fichas en la papelera, 100 tienen
-- updated_at a menos de 5 s de trashed_at.
--
-- Ahora la comparación deja afuera también trashed_at y trashed_by. Un cambio
-- de nombre o de carpeta en la MISMA sentencia sigue contando como
-- modificación (lo decide el resto de la fila). El orden de los triggers no
-- cambia: drive_items_borrado_por corre antes (orden alfabético) y cuidar ya
-- no mira lo que aquel escribe.
--
-- Lo que ya quedó mal: los 97 archivos importados de Google que están en la
-- papelera con la fecha de cuando se tiraron vuelven a la suya (la de Google
-- es created_at, que el trigger nunca toca; ver 20261002100000). Solo esos:
--   · importados (storage_key «<agencia>/google/<id>»): nunca se editaron
--     (editar mueve el storage_key) y su fecha de verdad se conoce;
--   · en la papelera AHORA y con updated_at a menos de 5 s de trashed_at: lo
--     último que les pasó fue la papelera.
-- Lo subido en Maven (y las carpetas) no tiene dónde mirar la fecha anterior:
-- se queda como está.

DO $$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc
      WHERE proname = 'drive_items_cuidar' AND pronamespace = 'public'::regnamespace)
     IS DISTINCT FROM 'b41c0e8a540888ca8453cdf5ca825a5e' THEN
    RAISE EXCEPTION 'drive_items_cuidar cambió en la base: revisar antes de reemplazarla';
  END IF;
END $$;

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
  ELSIF (to_jsonb(NEW) - 'updated_at' - 'last_opened_at' - 'unidad_id' - 'trashed_at' - 'trashed_by')
        IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at' - 'last_opened_at' - 'unidad_id' - 'trashed_at' - 'trashed_by') THEN
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

-- Los importados de Google que la papelera dejó con la fecha de hoy. Como la
-- edge (service_role): el trigger respeta un updated_at puesto a propósito.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  UPDATE public.drive_items SET updated_at = created_at
  WHERE storage_key LIKE '%/google/%'
    AND trashed_at IS NOT NULL
    AND updated_at IS DISTINCT FROM created_at
    AND abs(extract(epoch FROM (updated_at - trashed_at))) < 5;
END $$;

-- Vuelta atrás: la comparación de 20261002130000_drive_unidades.sql (sin
-- trashed_at ni trashed_by). Las fechas arregladas arriba no se deshacen.
--| CREATE OR REPLACE FUNCTION public.drive_items_cuidar()
--|  RETURNS trigger
--|  LANGUAGE plpgsql
--|  SET search_path TO 'public'
--| AS $function$
--| DECLARE actual uuid; pasos int := 0;
--| BEGIN
--|   IF TG_OP = 'INSERT' THEN
--|     IF NOT (auth.role() = 'service_role' AND NEW.updated_at IS NOT NULL) THEN
--|       NEW.updated_at := now();
--|     END IF;
--|   ELSIF auth.role() = 'service_role' AND NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
--|     NULL;
--|   ELSIF (to_jsonb(NEW) - 'updated_at' - 'last_opened_at' - 'unidad_id') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at' - 'last_opened_at' - 'unidad_id') THEN
--|     NEW.updated_at := now();
--|   ELSE
--|     NEW.updated_at := OLD.updated_at;
--|   END IF;
--|   IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN RETURN NEW; END IF;
--|   IF TG_OP = 'UPDATE' THEN
--|     IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
--|        OR NEW.tipo IS DISTINCT FROM OLD.tipo OR NEW.storage_key IS DISTINCT FROM OLD.storage_key
--|        OR NEW.size IS DISTINCT FROM OLD.size OR NEW.sha256 IS DISTINCT FROM OLD.sha256
--|        OR NEW.estado IS DISTINCT FROM OLD.estado OR NEW.mime IS DISTINCT FROM OLD.mime
--|        OR NEW.last_opened_at IS DISTINCT FROM OLD.last_opened_at THEN
--|       RAISE EXCEPTION 'Solo se puede cambiar el nombre, la carpeta o mandar a la papelera' USING ERRCODE = '42501';
--|     END IF;
--|   END IF;
--|   IF NEW.parent_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.parent_id IS DISTINCT FROM OLD.parent_id) THEN
--|     IF NOT EXISTS (SELECT 1 FROM public.drive_items p WHERE p.id = NEW.parent_id AND p.tipo = 'carpeta' AND p.tenant_id = NEW.tenant_id) THEN
--|       RAISE EXCEPTION 'La carpeta de destino no existe' USING ERRCODE = '23503';
--|     END IF;
--|     IF public.drive_mi_rol(NEW.parent_id) NOT IN ('dueno', 'editor') THEN
--|       RAISE EXCEPTION 'No puedes guardar en esa carpeta' USING ERRCODE = '42501';
--|     END IF;
--|     actual := NEW.parent_id;
--|     WHILE actual IS NOT NULL LOOP
--|       IF actual = NEW.id THEN RAISE EXCEPTION 'Una carpeta no puede quedar dentro de sí misma' USING ERRCODE = '23514'; END IF;
--|       pasos := pasos + 1; EXIT WHEN pasos > 50;
--|       SELECT parent_id INTO actual FROM public.drive_items WHERE id = actual;
--|     END LOOP;
--|   END IF;
--|   RETURN NEW;
--| END; $function$;
