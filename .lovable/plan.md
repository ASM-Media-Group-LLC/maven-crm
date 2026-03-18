

## Fix: Hangup in 1:1 Call Should Resolve the Host Request

### Problem
When either the participant or the host hangs up from a 1:1 call (via the red hangup button inside LiveKitCallView), only local state is cleared. The underlying host request remains open/acknowledged, so:
- The other side doesn't get notified that the call ended
- The auto-close logic (which watches for "resolved" status) never triggers
- The request lingers in the sidebar

The X button on the participant's overlay also only dismisses locally without resolving.

### Fix

**`src/pages/cowork/CoworkParticipantView.tsx`** — Two changes:
1. **LiveKitCallView `onLeave` (line 315-318)**: Call `cowork.resolveHostRequest(oneOnOneRequestId)` before clearing state, so the host side auto-closes via the existing realtime watcher.
2. **X button `onClick` (line 300-304)**: Also resolve the request instead of just dismissing locally.

**`src/pages/cowork/CoworkHostDashboard.tsx`** — One change:
1. **`leaveOneOnOne` callback (line 93-96)**: Call `cowork.resolveHostRequest(oneOnOneRequestId)` before clearing state, so the participant side auto-closes.

### Technical detail
Both sides already have auto-close effects that watch `cowork.hostRequests` for resolved/removed entries. Resolving the request on hangup triggers the other side's cleanup automatically via realtime.

### Files modified
- `src/pages/cowork/CoworkParticipantView.tsx` — Resolve request on hangup and X button
- `src/pages/cowork/CoworkHostDashboard.tsx` — Resolve request on host hangup

