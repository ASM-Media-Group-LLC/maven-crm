-- NO-OP migration: el cambio de scoring vive en el worker
-- (servicios/scouter-worker/src/llm.ts + handlers/score.ts), no en
-- DB. Este archivo queda solo de referencia para que el orden de
-- migrations sea trackeable junto con la feature.
--
-- Cambio: el scorer LLM ahora recibe companyConfig (target_countries,
-- target_gender, profile_tier, scoring_notes) y aplica deal-breakers:
--   · No-humano (marca/tienda/producto): score ≤ 3
--   · Género opuesto al target: score ≤ 2
--   · Sin país cuando target_countries está seteado: score ≤ 4
--   · País fuera de target: score ≤ 3
--   · Tier fuera de rango: score ≤ 5
--
-- Requiere redeploy del scouter-worker en Dokploy para que tenga efecto.

SELECT 1;
