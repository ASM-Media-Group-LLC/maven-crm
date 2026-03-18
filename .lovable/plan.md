

## Plan: Fix End Session Button Flow

### Problem
The "End Session" button (`Power` icon) in `CoworkHostDashboard.tsx` calls `cowork.endSession()` and shows a toast, but:
1. Does **not** disconnect from LiveKit (Host Hub + any active room call remain connected)
2. Does **not** navigate away — the host stays on a stale page with no cleanup
3. **No handling** for `session.status === "ended"` anywhere in the module — participants also stay connected indefinitely after session ends

### Changes

#### 1. `src/pages/cowork/CoworkHostDashboard.tsx` (lines 100-110)
Update the end session click handler to:
- Set `activeRoomLk` to `null` and `hubConnected` to `false` (triggers LiveKit disconnection via component unmount)
- Call `cowork.endSession()`
- Navigate to `/cowork` (removes `?session=` param, returns to landing)

#### 2. `src/pages/cowork/CoworkPage.tsx`
Add a check after loading: if `cowork.session?.status === "ended"`, show a message ("Esta sesión ha finalizado") and clear the session param / navigate to `/cowork`. This handles:
- Participants who are still connected when the host ends the session (realtime will update `session.status`)
- Users who click an old invite link to an ended session

#### 3. `src/pages/cowork/CoworkParticipantView.tsx`
No direct changes needed — the `CoworkPage` guard will unmount the participant view when session status becomes "ended", which will clean up LiveKit via component unmount.

### Files

| File | Change |
|------|--------|
| `src/pages/cowork/CoworkHostDashboard.tsx` | Add navigation + LiveKit cleanup to end session handler |
| `src/pages/cowork/CoworkPage.tsx` | Add guard for `session.status === "ended"` |

