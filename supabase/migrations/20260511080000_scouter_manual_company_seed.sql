-- Marca leads manualmente reasignados a una compañía como "seeds"
-- válidos para el lookalike. Idea: si el user editó la compañía de
-- una modelo desde el popup, es una señal humana fuerte de fit —
-- mismo peso que un seed_account cargado en Settings.

ALTER TABLE public.scouter_leads
  ADD COLUMN IF NOT EXISTS manual_company_assignment boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS scouter_leads_manual_seed_idx
  ON public.scouter_leads (company_id)
  WHERE manual_company_assignment = true;

-- RPC ampliado: ahora considera 2 tipos de seed para el match:
--   1. discovery_source LIKE 'seed:%' — los seed_accounts cargados en
--      Settings → Compañías, importados via discover_seed worker.
--   2. manual_company_assignment = true — leads reasignados a mano via
--      popup. El client setea la flag en el handleSave del popup
--      cuando el patch incluye target_companies.

CREATE OR REPLACE FUNCTION public.scouter_top_seed_match(p_lead_id uuid)
RETURNS TABLE (seed_handle text, similarity numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_emb vector(768);
BEGIN
  SELECT company_id, embedding INTO v_company, v_emb
  FROM public.scouter_leads
  WHERE id = p_lead_id;
  IF v_company IS NULL OR v_emb IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    s.instagram_handle AS seed_handle,
    (1 - (s.embedding <=> v_emb))::numeric(4, 3) AS similarity
  FROM public.scouter_leads s
  WHERE s.company_id = v_company
    AND (s.discovery_source LIKE 'seed:%' OR s.manual_company_assignment = true)
    AND s.embedding IS NOT NULL
    AND s.id <> p_lead_id
  ORDER BY s.embedding <=> v_emb
  LIMIT 1;
END;
$$;
