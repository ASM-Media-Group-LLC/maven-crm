
-- 1. Add new columns to notification_preferences
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS channel_push boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS channel_digest boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'all';

-- 2. Create notification_settings table
CREATE TABLE IF NOT EXISTS public.notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  notifications_enabled boolean NOT NULL DEFAULT true,
  realtime_enabled boolean NOT NULL DEFAULT true,
  group_similar boolean NOT NULL DEFAULT false,
  auto_mark_read_on_open boolean NOT NULL DEFAULT false,
  sound_enabled boolean NOT NULL DEFAULT false,
  show_critical_banners boolean NOT NULL DEFAULT true,
  dnd_enabled boolean NOT NULL DEFAULT false,
  dnd_start_time time WITHOUT TIME ZONE,
  dnd_end_time time WITHOUT TIME ZONE,
  dnd_allow_critical boolean NOT NULL DEFAULT true,
  digest_enabled boolean NOT NULL DEFAULT false,
  digest_frequency text NOT NULL DEFAULT 'daily',
  digest_time time WITHOUT TIME ZONE NOT NULL DEFAULT '09:00',
  digest_channel text NOT NULL DEFAULT 'in_app',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies: users can only access their own settings
CREATE POLICY "Users can view own notification settings"
  ON public.notification_settings FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own notification settings"
  ON public.notification_settings FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own notification settings"
  ON public.notification_settings FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 5. Updated_at trigger
CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
