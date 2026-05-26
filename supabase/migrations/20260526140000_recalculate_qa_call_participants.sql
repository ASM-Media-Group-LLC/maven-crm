-- Función que redistribuye participation_pct entre los participants
-- de una call según audio_metrics.speakers + claude_analysis. Llamada
-- automáticamente por qa-analyze al terminar el análisis, y también
-- desde EditQA cuando el user agrega/quita un support.

CREATE OR REPLACE FUNCTION public.recalculate_qa_call_participants(p_call_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_speakers jsonb;
  v_closer_speaker text;
  v_model_speaker text;
  v_total_closer_ratio numeric := 0;
  v_speakers_for_support text[];
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.qa_call_participants WHERE call_id = p_call_id;
  IF v_count = 0 THEN RETURN; END IF;
  IF v_count = 1 THEN
    UPDATE public.qa_call_participants SET participation_pct = 1.0 WHERE call_id = p_call_id;
    RETURN;
  END IF;
  SELECT c.audio_metrics->'speakers', c.claude_analysis->>'closer_speaker_label'
  INTO v_speakers, v_closer_speaker FROM public.qa_calls c WHERE c.id = p_call_id;
  IF v_speakers IS NULL OR jsonb_array_length(v_speakers) = 0 OR v_closer_speaker IS NULL THEN
    UPDATE public.qa_call_participants SET participation_pct = 1.0 / v_count WHERE call_id = p_call_id;
    RETURN;
  END IF;
  UPDATE public.qa_call_participants SET speaker_label = v_closer_speaker WHERE call_id = p_call_id AND role = 'primary';
  SELECT s.label INTO v_model_speaker FROM jsonb_to_recordset(v_speakers) AS s(label text, talk_ratio numeric)
    WHERE s.label != v_closer_speaker ORDER BY s.talk_ratio DESC NULLS LAST LIMIT 1;
  SELECT array_agg(label ORDER BY talk_ratio DESC NULLS LAST) INTO v_speakers_for_support
    FROM jsonb_to_recordset(v_speakers) AS s(label text, talk_ratio numeric)
    WHERE s.label != v_closer_speaker AND s.label IS DISTINCT FROM v_model_speaker AND s.talk_ratio > 0.05;
  IF v_speakers_for_support IS NOT NULL AND array_length(v_speakers_for_support, 1) > 0 THEN
    WITH ranked AS (
      SELECT call_id, closer_id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
      FROM public.qa_call_participants WHERE call_id = p_call_id AND role = 'support'
    )
    UPDATE public.qa_call_participants p SET speaker_label = v_speakers_for_support[r.rn] FROM ranked r
      WHERE p.call_id = r.call_id AND p.closer_id = r.closer_id AND r.rn <= array_length(v_speakers_for_support, 1);
  END IF;
  SELECT SUM(s.talk_ratio) INTO v_total_closer_ratio
    FROM public.qa_call_participants p
    JOIN jsonb_to_recordset(v_speakers) AS s(label text, talk_ratio numeric) ON s.label = p.speaker_label
    WHERE p.call_id = p_call_id;
  IF v_total_closer_ratio IS NULL OR v_total_closer_ratio <= 0 THEN
    UPDATE public.qa_call_participants SET participation_pct = 1.0 / v_count WHERE call_id = p_call_id;
    RETURN;
  END IF;
  UPDATE public.qa_call_participants p
    SET participation_pct = COALESCE(s.talk_ratio / v_total_closer_ratio, 0)
    FROM (SELECT label, talk_ratio FROM jsonb_to_recordset(v_speakers) AS x(label text, talk_ratio numeric)) s
    WHERE p.call_id = p_call_id AND p.speaker_label = s.label;
  UPDATE public.qa_call_participants SET participation_pct = 0
    WHERE call_id = p_call_id AND (speaker_label IS NULL OR speaker_label NOT IN (
      SELECT label FROM jsonb_to_recordset(v_speakers) AS x(label text, talk_ratio numeric)
    ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_qa_call_participants(uuid) TO authenticated, service_role, anon;
