-- El trigger logueaba CUALQUIER cambio de physical_appearance, incluido pasar de
-- 'b' a 'B' (solo mayúsculas) → ruido en contact_category_changes (lo generó la
-- normalización masiva de categorías). Ahora solo loguea cambios REALES
-- (case-insensitive + trim). Aplicada vía MCP (harden_log_contact_category_change_ignore_case)
-- el 2026-06-17; además se purgaron las ~155 filas de ruido existentes (one-off).
CREATE OR REPLACE FUNCTION public.log_contact_category_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  hours_diff double precision;
BEGIN
  IF upper(btrim(COALESCE(OLD.physical_appearance, ''))) IS DISTINCT FROM upper(btrim(COALESCE(NEW.physical_appearance, ''))) THEN
    hours_diff := EXTRACT(EPOCH FROM (now() - COALESCE(OLD.created_at, now()))) / 3600.0;
    INSERT INTO public.contact_category_changes (
      contact_id, contact_name, contact_handle,
      old_category, new_category, changed_by,
      contact_created_at, hours_since_creation
    ) VALUES (
      NEW.id, NEW.name, NEW.handle,
      OLD.physical_appearance, NEW.physical_appearance,
      auth.uid(),
      OLD.created_at, hours_diff
    );
  END IF;
  RETURN NEW;
END;
$function$;
