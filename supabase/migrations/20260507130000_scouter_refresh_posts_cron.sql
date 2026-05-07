-- Cron semanal que enquea refresh_posts para todos los high_fit del
-- pool. Mantiene scouter_leads.recent_posts fresco — los posts cambian
-- y los comentarios sugeridos pierden contexto si se quedan viejos.
--
-- Estrategia:
--   - Domingos 04:00 UTC (poco tráfico, no compite con el cron de
--     scouter-generate-tasks que corre 06:00 UTC los días que hay
--     spammers activos).
--   - Solo encola para leads ai_status='high_fit'.
--   - ON CONFLICT no aplica (scouter_jobs no tiene unique sobre
--     leadId+kind), así que para evitar duplicados con jobs ya
--     encolados, filtramos: NOT EXISTS un refresh_posts para ese
--     lead que esté en queued|running.
--
-- Costo Apify: ~$0.001 por lead × N high_fit del tenant. Para un
-- pool típico (30% high_fit de 1000 leads = 300) → $0.30/semana.

SELECT cron.schedule(
  'scouter-refresh-high-fit-posts',
  '0 4 * * 0',  -- domingo 04:00 UTC
  $cron$
  INSERT INTO public.scouter_jobs (kind, tenant_id, payload, priority, status)
  SELECT
    'refresh_posts',
    l.tenant_id,
    jsonb_build_object('leadId', l.id),
    3,
    'queued'
  FROM public.scouter_leads l
  WHERE l.ai_status = 'high_fit'
    AND NOT EXISTS (
      SELECT 1 FROM public.scouter_jobs j
      WHERE j.kind = 'refresh_posts'
        AND j.payload->>'leadId' = l.id::text
        AND j.status IN ('queued', 'running')
    );
  $cron$
);
