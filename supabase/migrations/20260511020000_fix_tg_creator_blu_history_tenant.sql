-- Fix: tg_creator_blu_history referenciaba NEW.tenant_id, pero la tabla
-- public.creators no tiene esa columna. Resultado: cada toggle de
-- blu_infloww_active fallaba con `record "new" has no field "tenant_id"`.
--
-- creator_blu_history.tenant_id es nullable; usamos current_tenant_id()
-- (helper que ya existe en el schema) para conservar el tenant cuando
-- haya contexto auth disponible. Si el helper devuelve NULL (service role,
-- jobs), queda NULL — el historial sigue siendo válido vía creator_id.

CREATE OR REPLACE FUNCTION public.tg_creator_blu_history()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_user   uuid;
  v_tenant uuid;
BEGIN
  BEGIN
    v_user := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user := NULL;
  END;

  BEGIN
    v_tenant := current_tenant_id();
  EXCEPTION WHEN OTHERS THEN
    v_tenant := NULL;
  END;

  IF TG_OP = 'INSERT' AND NEW.blu_infloww_active = true THEN
    INSERT INTO public.creator_blu_history (creator_id, new_state, changed_by, tenant_id)
    VALUES (NEW.id, true, v_user, v_tenant);
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.blu_infloww_active IS DISTINCT FROM NEW.blu_infloww_active THEN
    INSERT INTO public.creator_blu_history (creator_id, new_state, changed_by, tenant_id)
    VALUES (NEW.id, NEW.blu_infloww_active, v_user, v_tenant);
  END IF;

  RETURN NEW;
END;
$function$;
