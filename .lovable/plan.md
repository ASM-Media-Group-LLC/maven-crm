

## Problem

The Dashboard shows data and actions that don't respect the user's role permissions. Three issues:

1. **KPI cards**: "Active Tickets" always shows (`show: true`), but closers shouldn't see it. "Empleados Activos" correctly checks `canAccess("hr")` but uses lowercase — the permission system uses `"HR"`.

2. **Quick Actions**: The `module` field in `ALL_ACTIONS` uses lowercase names (`"hr"`, `"tickets"`, `"closers"`) but the permission system uses capitalized names (`"HR"`, `"Tickets"`, `"Closers"`). So `canAccess("hr")` never matches a configured permission, causing the fallback logic to kick in (which may allow access incorrectly).

3. **Dashboard sections**: The "Customer Service" card (Row 4, line 577) always renders without a `canAccess` check. The "Actividad Reciente" section shows tickets/events regardless of role. The "Recursos Humanos" card correctly wraps in `canAccess("hr")` but with the wrong case.

## Plan

**File: `src/components/dashboard/DashboardContent.tsx`**

1. **Fix module name casing in `ALL_ACTIONS`** — change all `module` values to match the sidebar's permission names:
   - `"contactos"` → `"Contactos"`, `"tareas"` → `"Tareas"`, `"eventos"` → `"Eventos"`, `"creadores"` → `"Creadores"`, `"leadgen"` → `"LeadGen"`, `"closers"` → `"Closers"`, `"tickets"` → `"Tickets"`, `"hr"` → `"HR"`, `"finanzas"` → `"Finanzas"`, `"promolog"` → `"Promolog"`, `"sales"` → `"Creator Sales"`, `"admin"` → `"Administración"`

2. **Fix KPI permission checks**:
   - "Active Tickets": change `show: true` → `show: canAccess("Tickets")`
   - "Empleados Activos": fix `canAccess("hr")` → `canAccess("HR")`
   - "New Leads Today": fix `canAccess("leadgen")` → `canAccess("LeadGen")`
   - "Total Creators": fix `canAccess("creadores")` → `canAccess("Creadores")`

3. **Fix section permission guards**:
   - Weekly Performance chart: `canAccess("leadgen")` → `canAccess("LeadGen")`
   - Pipeline chart: same fix
   - Top 5 Creadoras: `canAccess("creadores")` → `canAccess("Creadores")`
   - Customer Service card (line 577): wrap with `canAccess("Tickets") &&`
   - Closers card: fix `canAccess("closers")` → `canAccess("Closers")`
   - HR card: fix `canAccess("hr")` → `canAccess("HR")`

4. **Filter "Actividad Reciente" by role** — filter the `recentActivity` items before rendering: only show `ticket` type if `canAccess("Tickets")`, only show `event` type if `canAccess("Eventos")`. Tasks are universal so always shown.

5. **Update default quick action IDs** — change `DEFAULT_ACTION_IDS` from `["contactos", "tareas", "eventos", "creadores", "tickets", "hr"]` to something more universal like `["contactos", "tareas", "eventos"]`, since the permission filter will remove inaccessible ones anyway but this avoids showing empty slots on first load for restricted roles.

All changes are in a single file. No database or backend changes needed.

