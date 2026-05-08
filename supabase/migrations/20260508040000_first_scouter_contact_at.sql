-- ─── Métrica "primera vez contactada por scouter team" ─────────────────
--
-- El user clarificó que un lead se considera "contactado por scouter"
-- SOLO cuando un spammer completa una task tipo 'comment' adjuntando
-- screenshot del comentario. Nunca cuenta el simple hecho de que la
-- lead exista en `scouter_leads` (esos son leads descubiertos pero no
-- todavía contactados — pool de prospección).
--
-- Misma estética que phone_first_set_at: columna + trigger idempotente.
-- Una vez seteado el timestamp, no se vuelve a sobrescribir.

ALTER TABLE public.scouter_leads
  ADD COLUMN IF NOT EXISTS first_scouter_contact_at timestamptz;

CREATE INDEX IF NOT EXISTS scouter_leads_first_contact_idx
  ON public.scouter_leads (first_scouter_contact_at)
  WHERE first_scouter_contact_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_scouter_first_contact()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_lead_id uuid;
BEGIN
  -- Solo nos interesa tasks tipo 'comment' que ahora tienen screenshot.
  IF NEW.task_type IS DISTINCT FROM 'comment' OR NEW.screenshot_url IS NULL THEN
    RETURN NEW;
  END IF;

  -- En UPDATE solo el momento NULL→no-NULL del screenshot_url. Ediciones
  -- subsiguientes no recapturan.
  IF TG_OP = 'UPDATE' AND OLD.screenshot_url IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Resolver lead_id via assignment.
  SELECT lead_id INTO v_lead_id
  FROM public.scouter_daily_assignments
  WHERE id = NEW.assignment_id;

  IF v_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotente: solo setea si está NULL.
  UPDATE public.scouter_leads
  SET first_scouter_contact_at = NOW()
  WHERE id = v_lead_id
    AND first_scouter_contact_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scouter_first_contact ON public.scouter_interaction_tasks;
CREATE TRIGGER trg_scouter_first_contact
  AFTER INSERT OR UPDATE OF screenshot_url ON public.scouter_interaction_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_scouter_first_contact();

-- Backfill defensivo — si por alguna razón ya hay tasks con screenshot
-- en la base, capturamos el primer momento. Si no hay (el user dijo que
-- el equipo no trabajó todavía), este UPDATE no toca nada.
UPDATE public.scouter_leads sl
SET first_scouter_contact_at = sub.first_at
FROM (
  SELECT a.lead_id, MIN(COALESCE(t.completed_at, t.created_at)) AS first_at
  FROM public.scouter_interaction_tasks t
  JOIN public.scouter_daily_assignments a ON a.id = t.assignment_id
  WHERE t.task_type = 'comment'
    AND t.screenshot_url IS NOT NULL
  GROUP BY a.lead_id
) sub
WHERE sl.id = sub.lead_id
  AND sl.first_scouter_contact_at IS NULL;
