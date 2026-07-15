-- Re-anclar la cadencia de "contacto vencido" al ÚLTIMO contacto.
--
-- Antes: el deadline se calculaba SIEMPRE desde passed_date (fijo). Un lead
-- asignado hace 49 días seguía "Vencido" aunque el closer lo contactara hoy,
-- porque passed_date + cadencia ya estaba en el pasado. Ahora, con ≥1 contacto,
-- el próximo vencimiento se cuenta desde last_contact_date + el gap de la
-- cadencia → contactar "pone al día" el lead. Espeja getNextContactDate/
-- isContactOverdue en frontend/src/pages/closers/hooks/useCloserLeads.ts.
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
        'Completaste los 6 contactos a @' || handle || '. Decidí: seguir o marcar como No interesada.',
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
        'Contacto ' || next_idx::text || ' de @' || handle ||
          ' venció el ' || to_char(deadline_date, 'DD/MM') || '.',
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
