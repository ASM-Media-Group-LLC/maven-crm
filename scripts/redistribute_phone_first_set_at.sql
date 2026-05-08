-- ─── Redistribuir phone_first_set_at desde 2026-03-01 ──────────────────
--
-- Objetivo: poblar phone_first_set_at de manera realista para que el
-- dashboard muestre data en "Números obtenidos" y "Tasa de números"
-- distribuida en el tiempo. Cada fila con teléfono recibe un timestamp
-- aleatorio entre 2026-03-01 y hoy (~69 días), con variación natural
-- por la naturaleza random().
--
-- Cubre AMBAS tablas:
--   • leadgen_entries (4 filas con phone_e164)
--   • scouter_leads (2606 filas con phone — actualmente NULL en
--     phone_first_set_at por la decisión anterior de tratarlas como
--     residuo; este script restaura el timestamp con fines de demo).
--
-- Dist esperada: ~2610 / 69 ≈ ~38 por día con varianza ±10-15.
--
-- El UPDATE solo escribe phone_first_set_at — no toca phone_e164/phone
-- ni created_at, así que no dispara ningún otro trigger.

BEGIN;

UPDATE public.leadgen_entries
SET phone_first_set_at = TIMESTAMPTZ '2026-03-01 00:00:00+00'
                       + (random() * INTERVAL '69 days')
WHERE phone_e164 IS NOT NULL;

UPDATE public.scouter_leads
SET phone_first_set_at = TIMESTAMPTZ '2026-03-01 00:00:00+00'
                       + (random() * INTERVAL '69 days')
WHERE phone IS NOT NULL;

-- Verificación: distribución por día (ambas tablas combinadas)
SELECT day, SUM(n) AS total, MAX(CASE WHEN src = 'leadgen' THEN n ELSE 0 END) AS leadgen, MAX(CASE WHEN src = 'scouter' THEN n ELSE 0 END) AS scouter
FROM (
  SELECT 'leadgen' AS src, DATE(phone_first_set_at) AS day, COUNT(*) AS n
  FROM public.leadgen_entries WHERE phone_first_set_at IS NOT NULL
  GROUP BY 1, 2
  UNION ALL
  SELECT 'scouter' AS src, DATE(phone_first_set_at) AS day, COUNT(*) AS n
  FROM public.scouter_leads WHERE phone_first_set_at IS NOT NULL
  GROUP BY 1, 2
) sub
GROUP BY day
ORDER BY day;

COMMIT;
