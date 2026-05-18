-- Closers — sistema de alertas de contactos
--
-- Tres notificaciones automatizadas para el closer asignado:
--   1. closer_assigned       — cuando se le asigna una lead nueva.
--   2. closer_contact_overdue — cuando un contacto programado venció
--      (cadencia: día 1 / 3 / 5 / 8 / 15 / 29 desde passed_date).
--      Un notif por (creator, contact_index), no spam.
--   3. closer_contact_decision — cuando completó los 6 contactos y la
--      lead sigue en stage='Asignada'. Pide decisión (seguir o marcar
--      como No interesada). Un notif por creator.
--
-- Mecánica:
--   · Trigger AFTER UPDATE OF assigned_to ON closer_creators dispara
--     "closer_assigned" inmediato.
--   · Función `check_closer_contact_alerts()` corre cada 3h vía
--     pg_cron y dispara overdue/decision.
--   · Dedup via `automation_key` (unique index parcial ya existe).
--     Ningún job puede crear duplicados aunque corra varias veces.

-- ─── 1. Trigger: notificación al asignar ─────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_closer_on_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  handle text;
BEGIN
  -- Nada que notificar si no hay closer
  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  -- En UPDATE, sólo disparar si assigned_to cambió. INSERT siempre pasa.
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
    'Se te asignó @' || handle || ' — primer contacto en 1 día.',
    NEW.id,
    'closer_creator',
    'closers',
    'medium',
    'new',
    '/closers?id=' || NEW.id::text,
    'Closers',
    'closer_assigned:' || NEW.id::text || ':' || NEW.assigned_to::text
  )
  ON CONFLICT (automation_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_closer_creator_assigned ON public.closer_creators;
CREATE TRIGGER on_closer_creator_assigned
  AFTER INSERT OR UPDATE OF assigned_to ON public.closer_creators
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_closer_on_assignment();

-- ─── 2. Función: chequear overdue + decision needed ─────────────────

CREATE OR REPLACE FUNCTION public.check_closer_contact_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  -- Cadencia: día desde passed_date para cada contacto (1..6)
  cadence int[] := ARRAY[1, 3, 5, 8, 15, 29];
  rec RECORD;
  contact_count int;
  next_idx int;
  deadline_day int;
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
    -- Contar intentos ya registrados
    SELECT count(*) INTO contact_count
    FROM public.closer_contact_history
    WHERE creator_id = rec.id;

    handle := COALESCE(rec.instagram_handle, 'sin handle');

    -- Caso 1: ya hizo los 6 contactos → decisión pendiente
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
      ON CONFLICT (automation_key) DO NOTHING;
      CONTINUE;
    END IF;

    -- Caso 2: chequear si el próximo contacto está vencido.
    -- next_idx es 1-based (1..6) — coincide con la posición en cadence.
    next_idx := contact_count + 1;
    deadline_day := cadence[next_idx];
    deadline_date := rec.passed_date + deadline_day;

    -- Deadline = medianoche del fin de "día N". Comparamos por fecha:
    -- si current_date > deadline_date, ya pasó. Ej: passed=2026-05-16,
    -- contacto 1 (día 1) deadline_date = 2026-05-17, alerta dispara
    -- en 2026-05-18 o después (perdió todo el día 17).
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
      ON CONFLICT (automation_key) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- ─── 3. pg_cron: cada 3h ─────────────────────────────────────────────

-- Borramos cualquier instancia previa (idempotencia de la migration)
SELECT cron.unschedule('closer-contact-alerts')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'closer-contact-alerts');

SELECT cron.schedule(
  'closer-contact-alerts',
  '0 */3 * * *',  -- minute 0, every 3 hours (00, 03, 06, ..., 21)
  $$ SELECT public.check_closer_contact_alerts(); $$
);
