-- ============================================================================
-- Chatter Evaluator: internal Maven notification recipients
-- ============================================================================
-- Adds a list of Maven user_ids that should receive an in-app notification
-- when a chatter evaluation is submitted, on top of the existing email
-- recipients (notification_emails). The Admin → Maven Notifications UI lets
-- the team pick from active Maven employees instead of typing emails.

ALTER TABLE public.chatter_config
  ADD COLUMN IF NOT EXISTS notify_user_ids uuid[] NOT NULL DEFAULT '{}';

-- The existing chatter_config policies already gate read/write to admins,
-- so no new policy is needed. The notifications table itself has its own
-- RLS that already permits authenticated users to insert (any examiner
-- finishing an evaluation will be authenticated).
