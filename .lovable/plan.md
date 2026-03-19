

## Plan: Always Display Screen Share Requests Section in Host Dashboard

### Problem
The "Screen Share" requests section in the sidebar only renders when `pendingSSRequests.length > 0` (line 323). Same pattern as the Solicitudes fix — make it permanently visible with an empty state.

### Change

**File: `src/pages/cowork/CoworkHostDashboard.tsx`**

- Remove the `{pendingSSRequests.length > 0 && ...}` conditional wrapper (~line 323)
- Keep the section always rendered
- Add empty state text ("Sin solicitudes de pantalla") when count is 0
- Header always shows count, e.g., `Screen Share (0)`

No other files affected. No orphan code.

