-- Trigger: cuando se crea una qa_call con closer_id, auto-poblar la row
-- primary en qa_call_participants. La UI solo agrega supports.

CREATE OR REPLACE FUNCTION public.qa_calls_create_primary_participant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.closer_id IS NOT NULL THEN
    INSERT INTO public.qa_call_participants (
      call_id, closer_id, role, participation_pct
    ) VALUES (
      NEW.id, NEW.closer_id, 'primary', 1.0
    )
    ON CONFLICT (call_id, closer_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS qa_calls_after_insert_primary_participant ON public.qa_calls;
CREATE TRIGGER qa_calls_after_insert_primary_participant
  AFTER INSERT ON public.qa_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.qa_calls_create_primary_participant();
