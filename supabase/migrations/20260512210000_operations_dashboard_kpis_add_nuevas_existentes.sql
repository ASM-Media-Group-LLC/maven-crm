-- operations_dashboard_kpis v2: agregar leadsNuevas / leadsExistentes
-- al payload del KPI dashboard.
--
--   · leadsNuevas      = entries en el rango con record_type='nuevo' o NULL
--   · leadsExistentes  = entries con record_type='reactivado'
--                        (duplicados re-ingresados después del lock 24h)
--
-- Reemplaza los chips LLG/Bot del card "Modelos contactadas" por
-- Nuevas/Existentes.

CREATE OR REPLACE FUNCTION public.operations_dashboard_kpis(
  p_from timestamp with time zone,
  p_to   timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contacted         int;
  v_scouter_contacts  int;
  v_scouter_generated int;
  v_numbers_obtained  int;
  v_closer_calls      int;
  v_closes            int;
  v_on_hold           int;
  v_rejections        int;
  v_entered_crm       int;
  v_leads_nuevas      int;
  v_leads_existentes  int;
  v_crm_mov           jsonb;
BEGIN
  SELECT COUNT(*) INTO v_contacted
  FROM leadgen_entries
  WHERE created_at >= p_from AND created_at <= p_to;

  SELECT
    COUNT(*) FILTER (WHERE record_type IS NULL OR record_type = 'nuevo'),
    COUNT(*) FILTER (WHERE record_type = 'reactivado')
  INTO v_leads_nuevas, v_leads_existentes
  FROM leadgen_entries
  WHERE created_at >= p_from AND created_at <= p_to;

  SELECT COUNT(*) INTO v_scouter_contacts
  FROM scouter_leads
  WHERE first_scouter_contact_at IS NOT NULL
    AND first_scouter_contact_at >= p_from
    AND first_scouter_contact_at <= p_to;

  SELECT COUNT(*) INTO v_scouter_generated
  FROM scouter_leads
  WHERE created_at >= p_from AND created_at <= p_to;

  SELECT COUNT(*) INTO v_numbers_obtained
  FROM v_model_phone_captures
  WHERE captured_at >= p_from AND captured_at <= p_to;

  SELECT COUNT(*) INTO v_closer_calls
  FROM qa_calls
  WHERE call_date >= p_from AND call_date <= p_to;

  SELECT COUNT(*) INTO v_closes
  FROM qa_calls
  WHERE call_date >= p_from AND call_date <= p_to
    AND claude_analysis->>'call_outcome' = 'cerro';

  SELECT COUNT(*) INTO v_on_hold
  FROM qa_calls
  WHERE call_date >= p_from AND call_date <= p_to
    AND claude_analysis->>'call_outcome' = 'en_espera';

  SELECT COUNT(*) INTO v_rejections
  FROM qa_calls
  WHERE call_date >= p_from AND call_date <= p_to
    AND claude_analysis->>'call_outcome' = 'no_cerro';

  SELECT COUNT(*) INTO v_entered_crm
  FROM creators
  WHERE entered_crm_at IS NOT NULL
    AND entered_crm_at >= p_from
    AND entered_crm_at <= p_to;

  v_crm_mov := crm_movements_in_range(p_from, p_to);

  RETURN jsonb_build_object(
    'contacted',         v_contacted,
    'scouterContacts',   v_scouter_contacts,
    'scouterGenerated',  v_scouter_generated,
    'numbersObtained',   v_numbers_obtained,
    'closerCalls',       v_closer_calls,
    'closes',            v_closes,
    'onHold',            v_on_hold,
    'rejections',        v_rejections,
    'enteredCrm',        v_entered_crm,
    'leadsNuevas',       v_leads_nuevas,
    'leadsExistentes',   v_leads_existentes,
    'crmAltas',          COALESCE((v_crm_mov->>'altas')::int, 0),
    'crmBajas',          COALESCE((v_crm_mov->>'bajas')::int, 0)
  );
END;
$function$;
