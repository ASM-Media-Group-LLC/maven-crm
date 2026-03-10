

## Problems Identified

1. **"Recursos" visible to employee role**: The `canAccess` function (line 76 in `usePermissions.ts`) returns `true` when no permission is configured for a module. Since the employee role has no explicit "Administración" entry in `role_permissions`, `canAccess("Administración")` defaults to `true`, showing the Recursos section.

2. **Dashboard spacing/layout**: Looking at the screenshot, the grid layout has inconsistent spacing — sections stretch unevenly, and when permission-filtered cards disappear, remaining cards don't redistribute well across the grid.

3. **"Ajustes" in sidebar**: The sidebar has a dedicated "Ajustes" link pointing to `/ajustes/notificaciones`. This should be removed since notification settings are already accessible from within the Notificaciones page itself (via the gear icon).

## Plan

### 1. Fix default permission fallback (`src/hooks/usePermissions.ts`)

Change line 76 from `return true` (allow by default) to `return false` (deny by default). This aligns with the "Default Deny" security model documented in the RBAC memory. If a module has no permission configured for a role, access is denied.

This single change fixes the "Recursos" bug for employee and any other role that lacks explicit permission entries.

### 2. Remove "Ajustes" from sidebar (`src/components/dashboard/DashboardSidebar.tsx`)

Remove the entire "Ajustes" group block (lines 641-656) — the `SidebarSeparator` and the `SidebarGroup` containing the Settings NavLink to `/ajustes/notificaciones`.

### 3. Improve dashboard layout spacing (`src/components/dashboard/DashboardContent.tsx`)

- **KPI row** (line 307): Change from fixed `lg:grid-cols-5` to `lg:grid-cols-${kpis.length}` pattern — use a dynamic approach: when fewer KPIs are visible, cards should fill the space. Use `grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5` with auto-fill so fewer cards don't look lost.
- **Row 3 (Pipeline + Top5 + Pending Tasks)** (line 476): When some cards are hidden by permissions, the remaining ones should expand. Change `lg:grid-cols-3` to use conditional column count based on how many cards are visible.
- **Row 4 (Operational Cards)** (line 580): Same approach — conditionally adjust grid columns.
- Add consistent `gap-4` instead of mixed `gap-4`/`gap-6` for uniform spacing throughout.

**Specific layout logic:**
- Count visible cards per row and set grid cols accordingly (e.g., if only 1 card visible in a row, it spans full width; 2 cards get `lg:grid-cols-2`).
- Use `useMemo` to compute visible card counts for rows 3 and 4.

### Files to modify
- `src/hooks/usePermissions.ts` — change default return to `false`
- `src/components/dashboard/DashboardSidebar.tsx` — remove Ajustes section
- `src/components/dashboard/DashboardContent.tsx` — improve grid responsiveness

