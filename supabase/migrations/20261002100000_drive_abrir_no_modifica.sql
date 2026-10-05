-- Drive: abrir un archivo no cambia su «Última modificación».
--
-- drive_items_cuidar ponía updated_at := now() en TODO update, y abrir un
-- archivo anota last_opened_at (edge drive, acción abrir): con solo mirarlo,
-- pasaba a «modificado hoy». Ahora:
--   · INSERT: como en 20261002090000 (la edge puede traer la fecha de Google).
--   · UPDATE de la edge que fija updated_at a propósito: se respeta (re-importar
--     un archivo que cambió en Google, o corregir una fecha).
--   · UPDATE que cambia algo más que last_opened_at: hora del cambio.
--   · UPDATE que solo anota la apertura: la fecha queda como estaba.
DO $$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc
      WHERE proname = 'drive_items_cuidar' AND pronamespace = 'public'::regnamespace)
     IS DISTINCT FROM 'fd7759d4563014a401693da63966bd96' THEN
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
  ELSIF (to_jsonb(NEW) - 'updated_at' - 'last_opened_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at' - 'last_opened_at') THEN
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

-- Lo que ya quedó mal: los importados de Google vuelven a su fecha (la de
-- Google es created_at, que el trigger nunca tocó).
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  UPDATE public.drive_items SET updated_at = created_at
  WHERE storage_key LIKE '%/google/%' AND updated_at IS DISTINCT FROM created_at;
END $$;
