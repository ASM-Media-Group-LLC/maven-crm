-- ─── Redistribuir scouter_leads.created_at desde 2026-05-01 ──────────────
--
-- Objetivo: spreader las leads del scouter en bloques de 1000 por día,
-- empezando el 2026-05-01, para que el dashboard muestre datos realistas
-- al filtrar por rangos de fechas.
--
-- Correr cada paso por separado en el Supabase SQL Editor del proyecto
-- destino. Pasos 1 y 2 son SOLO lectura (diagnóstico). El paso 3 es el
-- UPDATE — REVISAR el conteo del paso 1 antes de ejecutarlo.

-- ── Paso 1: estado actual ────────────────────────────────────────────
SELECT COUNT(*)                          AS total_leads,
       MIN(created_at)                   AS min_date,
       MAX(created_at)                   AS max_date,
       COUNT(DISTINCT DATE(created_at))  AS distinct_days
FROM public.scouter_leads;

-- ── Paso 2: distribución actual por día (top 30 días) ────────────────
SELECT DATE(created_at) AS day, COUNT(*) AS n
FROM public.scouter_leads
GROUP BY 1
ORDER BY 1 DESC
LIMIT 30;

-- ── Paso 3: redistribuir — 1000 por día desde 2026-05-01 ─────────────
-- ROW_NUMBER ordena estable por id. El offset de día es floor(rn/1000)
-- y la hora dentro del día es uniforme aleatoria. Si hay 8500 leads,
-- caen en May 1..May 9 (los últimos 500 en May 9).
--
-- Para sólo afectar leads dentro de un tenant específico, agregar
-- WHERE tenant_id = '<uuid>' al CTE.

BEGIN;

WITH numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY id) - 1 AS rn
  FROM public.scouter_leads
)
UPDATE public.scouter_leads sl
SET created_at = TIMESTAMPTZ '2026-05-01 00:00:00+00'
               + (n.rn / 1000) * INTERVAL '1 day'
               + (random() * INTERVAL '1 day')
FROM numbered n
WHERE sl.id = n.id;

-- ── Paso 4: verificar antes de COMMIT ────────────────────────────────
SELECT DATE(created_at) AS day, COUNT(*) AS n
FROM public.scouter_leads
GROUP BY 1
ORDER BY 1
LIMIT 30;

-- Si la distribución se ve bien:
COMMIT;

-- Si no, ROLLBACK; (descarta el UPDATE entero — ningún cambio quedará).
