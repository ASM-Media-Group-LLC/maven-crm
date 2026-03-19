

## Fix: Private Call Hang Up Should Return to Main Room with Reconnect Option

### Current Problem
When the participant hangs up the private call, `resolveHostRequest` is called (line 267), which kills the session on both sides. The same happens when `autoLeaveOnEmpty` fires. There's no way to rejoin if the host is still waiting.

### Desired Behavior
- Participant hangs up → returns to main room immediately
- If the host request is still open/acknowledged (host still in the private room), show a "Reconectar a llamada privada" button in the top bar
- Participant can click to rejoin the private call
- Only the host can fully resolve the request

### Changes

**`src/pages/cowork/CoworkParticipantView.tsx`**:

1. **Modify `onLeave` for 1:1 LiveKitCallView** (line 265-276):
   - Remove `resolveHostRequest` call — participant no longer kills the session
   - Set `dismissedRequestRef.current = oneOnOneRequestId` to prevent auto-restore takeover
   - Clear 1:1 state, reconnect to main room (keep existing reconnect logic)

2. **Add reconnect button in top bar**: When there's a dismissed request that's still active (`open`/`acknowledged` with `oneone_livekit_room`), show a "Reconectar a llamada privada" button. Clicking it clears `dismissedRequestRef` and re-enters the 1:1 room.

3. **Clean up unused state**: Remove `ssRequestStatus` (declared on line 19, never meaningfully used).

4. **Remove `oneOnOneWasActiveRef`**: This ref was only needed to detect when a resolved request disappears from the list. The auto-close effect (line 101-127) already handles `status === "resolved"` directly. The fallback branch (line 118-126) that uses this ref can cause false positives. Replace with a simpler check.

### Host Side (`CoworkHostDashboard.tsx`)
No changes needed. The host's `leaveOneOnOne` still calls `resolveHostRequest`, and the host can also click "Resolver" in the sidebar. The `autoLeaveOnEmpty` on the host side correctly resolves (host leaving = session over).

### Files Modified
- `src/pages/cowork/CoworkParticipantView.tsx` — 4 changes: modify onLeave, add reconnect button, remove unused state, simplify auto-close effect

