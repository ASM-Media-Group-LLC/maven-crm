-- Fix trigger functions to use UUID comparison instead of text
CREATE OR REPLACE FUNCTION public.cleanup_announcement_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM notifications
  WHERE reference_type = 'announcement' AND reference_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_announcement_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_active = true AND NEW.is_active = false THEN
    UPDATE notifications SET status = 'archived'
    WHERE reference_type = 'announcement' AND reference_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;