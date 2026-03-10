

## Plan: Restrict Clari AI FAB to admin role on /dashboard

**File: `src/pages/Dashboard.tsx`**

- Import `useUserRole` from `@/hooks/useUserRole`
- Extract `isAdmin` from the hook
- Wrap `<ClariAiFab />` with `{isAdmin && <ClariAiFab />}`

One file, three lines changed.

