-- look_score: análisis visual del perfil del lead.
-- Lo llena el worker (servicios/scouter-worker) corriendo un modelo
-- de visión (Claude Haiku) sobre photo_data_url. Solo se calcula
-- para leads borderline en followers (5k-50k) — los <5k descartamos
-- por defecto, los >50k ya pasan el filtro por followers solo.
--
-- Rango: 0.0 a 10.0 con 1 decimal.
--   >= 7.0  → buen look, puede compensar pocos followers
--   5.0-7.0 → look promedio
--   < 5.0   → look débil, mantener low_fit
--   NULL    → no se analizó (no aplica el filtro borderline o
--             la foto no era una persona)
--
-- El text scorer (Groq) lee este campo cuando está presente y lo
-- usa para ajustar status. Sin look_score → flujo previo solo texto.

ALTER TABLE public.scouter_leads
  ADD COLUMN IF NOT EXISTS look_score numeric(3,1) DEFAULT NULL;

COMMENT ON COLUMN public.scouter_leads.look_score IS
  'Vision-based aesthetic score 0-10 (1 decimal). Only set for borderline leads (5k-50k followers). NULL means not analyzed.';

CREATE INDEX IF NOT EXISTS idx_scouter_leads_look_score
  ON public.scouter_leads(look_score)
  WHERE look_score IS NOT NULL;
