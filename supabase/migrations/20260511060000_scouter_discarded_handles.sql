-- ─── Blocklist de handles descartados en Scouter Assist ────────────────
-- Cuando un user descarta un perfil desde el popup, ya no queremos que
-- siga vivo en scouter_leads (era clutter visual y conteo inflado).
-- Tampoco queremos que el discovery del worker lo vuelva a agregar
-- semanas después olvidando que ya lo descartamos.
--
-- Solución: tabla mínima (sólo handle + metadata de auditoría) que el
-- worker consulta antes de cada insert en scouter_leads. El lead real
-- se DELETE-ea de scouter_leads cuando entra a esta lista.
-- Scope: tenant-global. Si un handle se descarta para Compañía A,
-- tampoco se vuelve a agregar a Compañía B dentro del mismo tenant.

CREATE TABLE IF NOT EXISTS public.scouter_discarded_handles (
  handle         text NOT NULL,
  tenant_id      uuid NOT NULL,
  discarded_at   timestamptz NOT NULL DEFAULT now(),
  discarded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason         text,
  PRIMARY KEY (handle, tenant_id)
);

CREATE INDEX IF NOT EXISTS scouter_discarded_handles_tenant_idx
  ON public.scouter_discarded_handles (tenant_id);

ALTER TABLE public.scouter_discarded_handles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scouter_discarded_read" ON public.scouter_discarded_handles;
CREATE POLICY "scouter_discarded_read"
  ON public.scouter_discarded_handles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "scouter_discarded_insert" ON public.scouter_discarded_handles;
CREATE POLICY "scouter_discarded_insert"
  ON public.scouter_discarded_handles FOR INSERT
  TO authenticated, service_role WITH CHECK (true);

DROP POLICY IF EXISTS "scouter_discarded_delete" ON public.scouter_discarded_handles;
CREATE POLICY "scouter_discarded_delete"
  ON public.scouter_discarded_handles FOR DELETE
  TO authenticated USING (true);

-- ── Backfill ────────────────────────────────────────────────────────────
-- Los leads con status='discarded' que ya existen en scouter_leads
-- migran a la blocklist y se borran del feed activo. Si un mismo
-- handle aparece en varios leads (varias compañías), guardamos solo
-- una entrada — el handle no se vuelve a agregar a ninguna compañía.

INSERT INTO public.scouter_discarded_handles (handle, tenant_id, discarded_at, reason)
SELECT DISTINCT
  LOWER(TRIM(instagram_handle)) AS handle,
  tenant_id,
  MAX(updated_at) AS discarded_at,
  'backfill-from-status' AS reason
FROM public.scouter_leads
WHERE status = 'discarded' AND instagram_handle IS NOT NULL
GROUP BY LOWER(TRIM(instagram_handle)), tenant_id
ON CONFLICT (handle, tenant_id) DO NOTHING;

DELETE FROM public.scouter_leads WHERE status = 'discarded';
