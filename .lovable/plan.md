

## Plan: Always Display Solicitudes Section in Host Dashboard

### Problem
The "Solicitudes" (Host Requests) section on the sidebar only renders when `openHostRequests.length > 0` (line 258). The user wants it permanently visible with an empty state when no requests exist.

### Change

**File: `src/pages/cowork/CoworkHostDashboard.tsx`**

- Remove the `{openHostRequests.length > 0 && ...}` conditional wrapper around the Solicitudes section (lines 258 and 318)
- Keep the section always rendered
- Add an empty state message (e.g., "Sin solicitudes pendientes") when `openHostRequests.length === 0`
- The header will always show the count, displaying "(0)" when empty

No other files need changes. No orphan or obsolete code related to this request.

