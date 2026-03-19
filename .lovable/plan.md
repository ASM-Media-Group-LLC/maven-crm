

## Fix: Ghost Session on Host After Participant Leaves Private Call

### Root Cause

When the participant leaves the private call, the cleanup depends on an API call (`resolveHostRequest`) succeeding AND the realtime subscription delivering the change to the host. Two failure scenarios cause a persistent ghost on the host side:

1. **Participant closes browser tab**: The `beforeunload` handler in `LiveKitCallView` only calls `lk.disconnect()` — it never calls `onLeave`, so `resolveHostRequest` is never invoked. The host stays in the 1:1 view with 0 remote participants indefinitely.

2. **API call fails or is slow**: Even when the participant clicks hang up, if `resolveHostRequest` fails (network error, edge function timeout), the host's realtime never fires the cleanup. The host sees an empty call — the ghost.

In both cases, the LiveKit room on the host side instantly shows 0 remote participants, but nothing in the current code reacts to that signal.

### Solution: Auto-Leave on Empty Room

Add an `autoLeaveOnEmpty` prop to `LiveKitCallView`. When enabled, if the remote participant count drops to 0 and stays there for a configurable timeout (e.g., 3 seconds), it automatically calls `onLeave`. This provides instant, reliable ghost detection regardless of API or realtime failures.

### Implementation

**`src/pages/messenger/videocall/LiveKitCallView.tsx`**:
- Add `autoLeaveOnEmpty?: number` prop (timeout in ms, e.g. `3000`)
- Add an effect that watches `lk.participants`: when remote participants (non-local) count is 0, start a timer. If it remains 0 for the timeout, call `handleLeave`. Clear timer if a remote participant appears.

**`src/pages/cowork/CoworkHostDashboard.tsx`**:
- Pass `autoLeaveOnEmpty={3000}` to the 1:1 LiveKitCallView (when `oneOnOneRoom` is active). Not on the regular room or Hub views — only private calls.

**`src/pages/cowork/CoworkParticipantView.tsx`**:
- Pass `autoLeaveOnEmpty={3000}` to the 1:1 LiveKitCallView. This handles the reverse case (host leaves/disconnects first).

### Flow After Fix
```text
Participant hangs up (or closes tab)
  └─ LiveKit server removes participant instantly
  └─ Host's LiveKitCallView detects 0 remote participants
  └─ 3-second timer starts
  └─ Timer fires → handleLeave() called
  └─ onLeave → resolveHostRequest + clear state
  └─ Ghost eliminated
```

### Files Modified
- `src/pages/messenger/videocall/LiveKitCallView.tsx` — Add `autoLeaveOnEmpty` prop + effect
- `src/pages/cowork/CoworkHostDashboard.tsx` — Pass prop to 1:1 LiveKitCallView
- `src/pages/cowork/CoworkParticipantView.tsx` — Pass prop to 1:1 LiveKitCallView

