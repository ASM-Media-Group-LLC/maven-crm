-- Alertas in-app de closers más cortas (pedido de Álvaro 08/2026: menos texto).
-- CREATE OR REPLACE del cuerpo VIVO en prod (pg_get_functiondef), cambiando SOLO
-- los strings de mensaje. NO se editan las migraciones ya aplicadas.
--  · closer_assigned: se quita "Se te asignó" (el título ya lo dice).
--  · closer_contact_decision: se corrige voseo ("Decidí" → neutro) y se acorta,
--    conservando las DOS opciones (seguir / No interesada).
--  · closer_contact_overdue: se lidera con el @handle y se quitan conectores,
--    conservando el número de contacto y la fecha de vencimiento.

CREATE OR REPLACE FUNCTION public.notify_closer_on_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  handle text;
BEGIN
  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to THEN
    RETURN NEW;
  END IF;

  handle := COALESCE(NEW.instagram_handle, 'sin handle');

  INSERT INTO notifications (
    user_id, type, title, message, reference_id, reference_type,
    module_origin, priority, status, deep_link_url,
    required_permission_module, automation_key
  ) VALUES (
    NEW.assigned_to,
    'closer_assigned',
    'Nueva lead asignada',
    '@' || handle || ' asignada. Primer contacto en 1 día.',
    NEW.id,
    'closer_creator',
    'closers',
    'medium',
    'new',
    '/closers?id=' || NEW.id::text,
    'Closers',
    'closer_assigned:' || NEW.id::text || ':' || NEW.assigned_to::text
  )
  ON CONFLICT (automation_key) WHERE automation_key IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_closer_contact_alerts()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cadence int[] := ARRAY[1, 3, 5, 8, 15, 29];
  rec RECORD;
  contact_count int;
  last_contact date;
  next_idx int;
  gap int;
  deadline_date date;
  handle text;
BEGIN
  FOR rec IN
    SELECT cc.id, cc.assigned_to, cc.passed_date, cc.instagram_handle
    FROM public.closer_creators cc
    WHERE cc.stage = 'Asignada'
      AND cc.assigned_to IS NOT NULL
      AND cc.passed_date IS NOT NULL
  LOOP
    SELECT count(*), max(contact_date)::date INTO contact_count, last_contact
    FROM public.closer_contact_history
    WHERE creator_id = rec.id;

    handle := COALESCE(rec.instagram_handle, 'sin handle');

    IF contact_count >= 6 THEN
      INSERT INTO public.notifications (
        user_id, type, title, message, reference_id, reference_type,
        module_origin, priority, status, deep_link_url,
        required_permission_module, automation_key
      ) VALUES (
        rec.assigned_to,
        'closer_contact_decision',
        'Decisión pendiente',
        '6 contactos hechos a @' || handle || '. Sigues o marcas No interesada?',
        rec.id,
        'closer_creator',
        'closers',
        'medium',
        'new',
        '/closers?id=' || rec.id::text,
        'Closers',
        'closer_contact_decision:' || rec.id::text
      )
      ON CONFLICT (automation_key) WHERE automation_key IS NOT NULL DO NOTHING;
      CONTINUE;
    END IF;

    next_idx := contact_count + 1;
    -- Re-anclado: sin contactos → desde passed_date; con contactos → desde el
    -- último contacto + el gap de la cadencia hacia el próximo. Así contactar
    -- "pone al día" el lead (espeja getNextContactDate en el frontend).
    IF contact_count = 0 THEN
      deadline_date := rec.passed_date + cadence[1];
    ELSE
      gap := cadence[next_idx] - cadence[contact_count];
      deadline_date := COALESCE(last_contact, rec.passed_date) + gap;
    END IF;

    IF current_date > deadline_date THEN
      INSERT INTO public.notifications (
        user_id, type, title, message, reference_id, reference_type,
        module_origin, priority, status, deep_link_url,
        required_permission_module, automation_key
      ) VALUES (
        rec.assigned_to,
        'closer_contact_overdue',
        'Contacto vencido',
        '@' || handle || ': contacto ' || next_idx::text ||
          ' venció ' || to_char(deadline_date, 'DD/MM') || '.',
        rec.id,
        'closer_creator',
        'closers',
        'high',
        'new',
        '/closers?id=' || rec.id::text,
        'Closers',
        'closer_contact_overdue:' || rec.id::text || ':' || next_idx::text
      )
      ON CONFLICT (automation_key) WHERE automation_key IS NOT NULL DO NOTHING;
    END IF;
  END LOOP;
END;
$function$;
