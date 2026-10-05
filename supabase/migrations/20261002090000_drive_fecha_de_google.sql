-- Drive: lo importado de Google conserva su «Última modificación».
--
-- drive_items_cuidar ponía updated_at := now() SIEMPRE, así que los 428 mil
-- archivos traídos de Google iban a figurar como modificados el día de la
-- importación. Ahora, solo al INSERTAR desde la edge (service_role), se respeta
-- la fecha que trae la fila. Cualquier UPDATE, y todo lo que hace el
-- navegador, sigue poniendo la hora del cambio.
--
-- El cuerpo es el de prod (compactado por 20260929180000_funciones_sin_voseo);
-- si cambió desde entonces, no se toca nada.
DO $$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc
      WHERE proname = 'drive_items_cuidar' AND pronamespace = 'public'::regnamespace)
     IS DISTINCT FROM 'ba9035e5f1f0555a52a0fc789cd65277' THEN
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
  IF NOT (TG_OP = 'INSERT' AND auth.role() = 'service_role' AND NEW.updated_at IS NOT NULL) THEN
    NEW.updated_at := now();
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

