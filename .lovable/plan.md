

## Fix: Notifications showing to wrong roles

### Root Cause

There are **two conflicting SELECT RLS policies** on the `notifications` table:

1. `"Authenticated users can view notifications"` — allows ANY authenticated user to see all notifications where `user_id IS NULL`, **regardless of role_target**
2. `"Users can view own or role-targeted notifications"` — correctly checks `role_target IS NOT NULL AND user_has_role_name(...)`

Since both are PERMISSIVE (PostgreSQL ORs them), policy #1 overrides #2 and lets every user see **all** null-user notifications (like "Nueva modelo ha completado el onboarding" and "Verificación aprobada") even when they have no `role_target` or the user's role doesn't match.

### Database notifications with the problem

```text
title: "Nueva modelo ha completado el onboarding"  → user_id=NULL, role_target=NULL
title: "Verificación aprobada"                      → user_id=NULL, role_target=NULL
```

These should only be visible to admins/managers, but every user sees them.

### Changes

**1. Fix RLS policies (SQL migration)**

- DROP the overly permissive `"Authenticated users can view notifications"` SELECT policy
- DROP the overly permissive `"Authenticated users can update notifications"` UPDATE policy (same issue)
- The remaining policies (`"Users can view own or role-targeted notifications"` and `"Users can update own notifications"`) already have correct logic

**2. Client-side defense-in-depth (`useNotifications.ts`)**

Add a filter in `filteredNotifications` to exclude notifications where `user_id` is null AND `role_target` is null — these are orphaned/legacy notifications that shouldn't be visible to anyone except through specific targeting.

**3. Clean up orphaned notifications (SQL)**

Set `status = 'archived'` on existing notifications that have `user_id = NULL` and `role_target = NULL` to clean up legacy data that was incorrectly broadcast to everyone.

