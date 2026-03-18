

## Audit: "Llamar host" (1:1 Call) Flow

### Issues Found

1. **Participant response parsing is fragile**: In `CoworkParticipantView.tsx` line 177, the "Llamar host" onClick extracts `result?.oneone_livekit_room || result?.request?.oneone_livekit_room` and `result?.request?.id`. The edge function returns `{ request, oneone_livekit_room }` for both new AND existing requests. For **existing** requests (duplicate prevention path, line 336), the response shape is identical, so this works. However, if the edge function returns an existing request, the participant gets `oneone_livekit_room` from the top level — this is fine. **No bug here**, but the code is fragile.

2. **Auto-close fires toast on first load (false positive)**: In `CoworkParticipantView.tsx` lines 88-97, the auto-close effect fires `toast.info("Sesión 1:1 con host finalizada")` whenever `oneOnOneRequestId` is set but the request is not found in `hostRequests`. On page load, `hostRequests` starts as `[]` while `oneOnOneRequestId` is `null`, so this is fine. BUT the auto-restore effect (lines 99-109) runs first and sets `oneOnOneRequestId` from existing requests. Then if the realtime refetch hasn't loaded yet or there's a brief moment where `hostRequests` is stale, the auto-close effect could trigger a false toast. **Race condition between auto-restore and auto-close.**

3. **Host "Atender" for 1:1 sets `activeRoomId` to null**: In `CoworkHostDashboard.tsx` line 278, when the host clicks "Atender" for a 1:1 request, `setActiveRoomId(null)` is called. The `getActiveRoomToken` callback (line 81) uses `activeRoomId!` — if the token provider is called with `null`, the edge function receives `roomId: null` for `join_room` purpose. But for 1:1 requests, the code correctly uses `getOneOnOneToken` (line 372 conditional), so this is safe. **No bug**, but `activeRoomId` being null is inconsistent.

4. **Host can't return to room grid after 1:1 without manual action**: When the host resolves a 1:1 request, the auto-close effect (line 97-105) calls `leaveOneOnOne()` and `leaveActiveRoom()`, which correctly resets the view. When the host manually clicks "Resolver" (line 298-303), it also handles cleanup. **This works correctly.**

5. **Participant "Pedir host" disabled while 1:1 is active — but also disabled when any open request exists**: Line 155 `disabled={!!myOpenRequest || isInOneOnOne}`. Since `myOpenRequest` finds ANY open/acknowledged request (including non-1:1 ones), if a participant has a simple "Pedir host" open, they can't also "Llamar host". The duplicate prevention on the server (lines 328-337) also blocks creating a second request if any open/acknowledged one exists, regardless of type. **This means the user can't upgrade from a simple notification to a 1:1 call without resolving the first request.** This is a usability issue.

6. **Participant closing 1:1 overlay clears local state but request stays open**: Lines 269-271 clear `oneOnOneRoom` and `oneOnOneRequestId` when clicking X. But the auto-restore effect (lines 100-108) immediately detects the existing request and re-opens the overlay. **The X button effectively does nothing** — the overlay will reappear on the next render cycle. This is confusing UX.

### Fixes

#### Fix 1: Prevent auto-close false positive (race condition)
In `CoworkParticipantView.tsx`, add a guard so the auto-close effect only fires if the request was previously found and then disappeared (not on initial empty state).

#### Fix 2: Make overlay X button work by tracking dismissal
Add a `dismissedRequestId` ref. When the user clicks X, store the request ID. The auto-restore effect skips requests matching the dismissed ID. Clear it when the request is actually resolved or a new request is created.

#### Fix 3: Allow "Llamar host" even if a simple request is open
In the edge function `requestHost`, when `requestOneOnOne` is true but the existing request has `oneone_livekit_room = null` (simple request), resolve the old one and create the new 1:1 request. This lets users "upgrade" their request.

### Files Modified
- `supabase/functions/cowork-session/index.ts` — allow upgrading simple request to 1:1
- `src/pages/cowork/CoworkParticipantView.tsx` — fix race condition, fix X button behavior

