-- 1. Trigger: auto-delete notifications when announcement is deleted
CREATE OR REPLACE FUNCTION public.cleanup_announcement_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM notifications
  WHERE reference_type = 'announcement' AND reference_id = OLD.id::text;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_cleanup_announcement_notifications
BEFORE DELETE ON internal_announcements
FOR EACH ROW EXECUTE FUNCTION cleanup_announcement_notifications();

-- 2. Trigger: auto-archive notifications when announcement is deactivated
CREATE OR REPLACE FUNCTION public.archive_announcement_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_active = true AND NEW.is_active = false THEN
    UPDATE notifications SET status = 'archived'
    WHERE reference_type = 'announcement' AND reference_id = NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_archive_announcement_notifications
BEFORE UPDATE ON internal_announcements
FOR EACH ROW EXECUTE FUNCTION archive_announcement_notifications();