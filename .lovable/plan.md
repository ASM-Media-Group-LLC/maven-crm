

## Plan

Two changes:

### 1. Hide "Recursos" sidebar section for non-admin roles
**File: `src/components/dashboard/DashboardSidebar.tsx`**

The "Recursos" group (lines 607-637) containing Design System, Docs, and Roadmap has no permission guard. Wrap it with `{isAdmin && ( ... )}` using the existing `useUserRole` hook (or check if `canAccess("Administración")` is already available in scope -- it is, used on line 577).

Will wrap lines 607-637 with `{isAdmin && ( ... )}`. Since `isAdmin` may not be directly available, will use the same pattern as line 577: `{canAccess("Administración") && ( ... )}`.

### 2. Remove verify-email flow
Three files to modify:

- **`src/App.tsx`** (line 125): Remove the `/verify-email` route and the `VerifyEmail` import.
- **`src/pages/Register.tsx`** (line 98): Change `navigate("/verify-email", ...)` to `navigate("/login")` with a success toast telling the user to check their email.
- **`src/pages/VerifyEmail.tsx`**: Delete the entire file.

