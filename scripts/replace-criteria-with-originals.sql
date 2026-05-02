-- One-shot fix: replace the generic seed criteria with the EXACT 10 from the
-- original Roleplaychatters DEFAULT_CRITERIA in index.html. We do this by
-- DELETing the seed rows and inserting fresh ones in the original order.
-- Existing evaluations reference criteria by id, but at evaluation-time we
-- snapshot the label inside chatter_evaluations.criteria_results, so this
-- swap doesn't break historical reports.
--
-- Run from Supabase SQL Editor on the JHON-V3 branch.

BEGIN;

DELETE FROM public.chatter_criteria_defaults;

INSERT INTO public.chatter_criteria_defaults (label, label_en, position, weight, is_active) VALUES
  ('Detección de oportunidad de venta', 'Sales opportunity detection',     1, 1, true),
  ('Cierre o intento de venta',         'Closing or sales attempt',        2, 1, true),
  ('Conexión emocional real',           'Real emotional connection',       3, 1, true),
  ('Personalización estratégica',       'Strategic personalization',       4, 1, true),
  ('Lenguaje emocional y sugestivo',    'Emotional and suggestive tone',   5, 1, true),
  ('Coherencia del personaje',          'Character coherence',             6, 1, true),
  ('Control del ritmo y escalada',      'Pacing and escalation control',   7, 1, true),
  ('Manejo de objeciones',              'Objection handling',              8, 1, true),
  ('Ortografía y presentación',         'Spelling and presentation',       9, 1, true),
  ('Tiempos de respuesta',              'Response timing',                10, 1, true);

COMMIT;

-- Verify
SELECT position, label, label_en, is_active
FROM public.chatter_criteria_defaults
ORDER BY position;
