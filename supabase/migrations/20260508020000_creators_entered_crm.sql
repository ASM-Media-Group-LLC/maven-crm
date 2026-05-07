-- Marca operativa "modelo ingresó al CRM externo de OnlyFans".
-- El equipo no tiene API con su CRM de OF, así que el closer marca
-- manualmente cuando una modelo cerrada efectivamente se carga al
-- otro sistema. Es la última pieza del funnel del dashboard.

ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS entered_crm_at    timestamptz,
  ADD COLUMN IF NOT EXISTS entered_crm_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entered_crm_notes text;

-- Index para el dashboard que filtra por período de ingreso.
CREATE INDEX IF NOT EXISTS idx_creators_entered_crm_at
  ON public.creators(entered_crm_at DESC) WHERE entered_crm_at IS NOT NULL;
