

## Fix: Orphaned Announcement Notifications

### Root Cause

The announcement "Prueba nuevo anuncio de RRHH" (`400f0719...`) was deleted from `internal_announcements`, but its 10+ notification records remain in the `notifications` table. The client-side cleanup in `useDeleteAnnouncement` tries to delete notifications with `.eq("reference_type", "announcement").eq("reference_id", id)`, but **RLS blocks it** because the admin can only modify their own notifications, not other users' notifications.

Same problem affects `useArchiveAnnouncement` — it tries to update other users' notifications but RLS prevents it.

### Changes

**1. Database trigger (migration) — automatic cleanup**

Create an `ON DELETE` trigger on `internal_announcements` that automatically deletes all related notifications using `SECURITY DEFINER` (bypasses RLS):

```sql
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
```

**2. Database trigger — auto-archive on deactivation**

When an announcement is archived (`is_active` set to `false`), auto-archive its notifications:

```sql
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
```

**3. Clean up existing orphaned data (data operation)**

Delete the 10 orphaned notifications referencing the deleted announcement `400f0719-939e-4ab9-b0dc-dc369587ab7d`.

**4. Client-side filter (`useNotifications.ts`)**

Add a defense-in-depth check: for notifications with `reference_type = 'announcement'`, verify the referenced announcement still exists (or simply filter out announcement notifications whose `reference_id` doesn't match any active announcement). This is lightweight — we'll use a simpler approach: just validate that `reference_id` is not null for announcement-type notifications.

Actually, the DB triggers handle this going forward, so the client-side change is optional. The critical fix is the triggers + data cleanup.

