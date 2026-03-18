

## Audit: 1:1 Temporary Room Flow

### Issues Found

1. **Host has no auto-close for 1:1**: If the request is resolved (by another host or via realtime), the host stays stuck in the 1:1 view with no notification or automatic return to the room grid.

2. **Participant closing 1:1 overlay doesn't signal the host**: When participant clicks X or leaves the 1:1 overlay, the host request stays "open"/"acknowledged". The host still sees it in the sidebar and remains in the 1:1 room talking to no one.

3. **Duplicate host requests possible**: If participant closes the 1:1 overlay (clearing local state `oneOnOneRequestId`), there's no check against existing open/acknowledged requests from the same user. They can spam new requests, each creating a new LiveKit room.

4. **Participant re-entry impossible**: If participant closes and reopens the overlay, the local state is cleared but the request (with its 1:1 room) still exists. There's no mechanism to re-enter an existing 1:1 room.

### Plan

#### Edge Function (`cowork-session/index.ts`)

- **`requestHost`**: Before creating a new request, check if the user already has an open/acknowledged request for this session. If so, return the existing request and its `oneone_livekit_room` instead of creating a duplicate.

#### Participant View (`CoworkParticipantView.tsx`)

- **Auto-detect existing 1:1**: Add an effect that checks `cowork.hostRequests` for any open/acknowledged request from this user that has a `oneone_livekit_room`. If found and local 1:1 state is empty, auto-populate `oneOnOneRequestId` and `oneOnOneRoom` to restore the overlay (handles page refresh/reconnection).
- **On overlay close**: Keep the current behavior (just close overlay). The request remains open for the host to resolve. This is acceptable since the auto-detect effect will restore it if the participant navigates away and back.

#### Host Dashboard (`CoworkHostDashboard.tsx`)

- **Add auto-close effect**: Watch `cowork.hostRequests` for the current `oneOnOneRequestId`. If the request disappears (resolved) or status changes to "resolved", call `leaveOneOnOne()` and `leaveActiveRoom()` with a toast notification. This mirrors the participant's existing auto-close effect.

### Files Modified
- `supabase/functions/cowork-session/index.ts` -- prevent duplicate requests
- `src/pages/cowork/CoworkParticipantView.tsx` -- auto-restore 1:1 overlay from existing requests
- `src/pages/cowork/CoworkHostDashboard.tsx` -- auto-close 1:1 when request resolved

