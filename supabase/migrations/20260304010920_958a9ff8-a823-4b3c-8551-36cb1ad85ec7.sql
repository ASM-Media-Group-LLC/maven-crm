
-- Phase 3: Automation support
-- Add automation_key to notifications for deduplication
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS automation_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_automation_key ON public.notifications(automation_key) WHERE automation_key IS NOT NULL;

-- Automation log table
CREATE TABLE IF NOT EXISTS public.notification_automation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_type text NOT NULL,
  last_run_at timestamptz DEFAULT now(),
  records_processed int DEFAULT 0,
  UNIQUE(automation_type)
);

ALTER TABLE public.notification_automation_log ENABLE ROW LEVEL SECURITY;

-- Only service role can manage automation logs
CREATE POLICY "Service role can manage automation logs"
  ON public.notification_automation_log
  FOR ALL
  USING (true)
  WITH CHECK (true);
