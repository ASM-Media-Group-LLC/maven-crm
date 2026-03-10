

## Problems

1. **Orphaned notifications for deleted announcements**: When an announcement is deleted (`useDeleteAnnouncement`) or archived (`useArchiveAnnouncement`), the notifications referencing it remain in the system. Users see notifications for content that no longer exists.

2. **Notification settings module filter not role-aware**: The `MODULE_OPTIONS` filter dropdown on the Notificaciones page shows all modules (Creadores, Closers, Finanzas, etc.) regardless of the user's role permissions. A closer shouldn't see "Creadores" or "Finanzas" in the filter.

3. **NOTIFICATION_TYPES_BY_MODULE includes "Comunicación" notifications but lacks the module key**: Announcement notifications use `module_origin: "Comunicación"` but this isn't in the `NOTIFICATION_TYPES_BY_MODULE` map or `MODULE_OPTIONS`, making them unfilterable.

## Plan

### 1. Clean up notifications when announcements are deleted/archived

**File: `src/pages/hr/announcements/useAnnouncementsAdmin.ts`**

- In `useDeleteAnnouncement.mutationFn`: After deleting the announcement, also delete all notifications with `reference_type = 'announcement'` and `reference_id = id`.
- In `useArchiveAnnouncement.mutationFn`: After archiving, archive related notifications (`status = 'archived'`) so they stop appearing in the active feed.
- Invalidate `["notifications"]` query key in both `onSuccess` callbacks.

### 2. Filter MODULE_OPTIONS by role permissions

**File: `src/pages/Notificaciones.tsx`**

- Import `usePermissions` (already imported) and use `canAccess` to filter `MODULE_OPTIONS` before rendering the dropdown. Map module option values to permission module names and only show accessible ones.

**File: `src/lib/notificationHelpers.ts`**

- Add a `MODULE_PERMISSION_MAP` that maps module option values to permission module names (e.g., `"creadores" -> "Creadores"`, `"hr" -> "HR"`).
- Add `"comunicacion"` to `MODULE_OPTIONS` with label "Comunicación".
- Add `Comunicación` to `NOTIFICATION_TYPES_BY_MODULE` with `announcement` type.

### 3. Filter notification list by role

**File: `src/hooks/useNotifications.ts`**

- The existing `filteredNotifications` already checks `required_permission_module` with `canAccess`. Announcement notifications use `module_origin: "Comunicación"` but `required_permission_module` is not set for them. Update `sendAnnouncementNotifications` to include `required_permission_module: "HR"` so only users with HR access see announcement notifications (or keep them visible to all since announcements are targeted by audience already — the audience targeting handles this).

Actually, the real fix for orphaned notifications is simpler: just clean up on delete/archive.

### Files to modify
- `src/pages/hr/announcements/useAnnouncementsAdmin.ts` — clean up notifications on delete/archive
- `src/pages/Notificaciones.tsx` — filter MODULE_OPTIONS by permissions
- `src/lib/notificationHelpers.ts` — add permission mapping and "Comunicación" module option

