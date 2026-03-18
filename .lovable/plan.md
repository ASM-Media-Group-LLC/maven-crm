

## Plan: Fix Room Hangup Button Flow

### Problem

When a user clicks the hangup button (red "Salir" phone icon) inside a room call, `LiveKitCallView` calls `lk.disconnect()` then `onLeave()`. The issues:

1. **Participant View**: `onLeave` sets `connectedLkRoom = null`, which shows an infinite loading spinner. The `useEffect` on line 35 only triggers when `myRoom.livekit_room_name !== connectedLkRoom` — but since the room hasn't changed (just the local state was nulled), and `connectedLkRoom` is now `null`, it **does** re-trigger and reconnects. However, this creates a disconnect→immediate-reconnect loop — the user **cannot** actually leave the room call. There's no intentional "I want to stay disconnected" state.

2. **Host Room Call**: `onLeave` (`leaveActiveRoom`) sets `activeRoomLk = null`, returning to the room grid. This works correctly.

3. **Host Hub**: `onLeave` sets `hubConnected = false`, unmounting the Hub call. There is **no way to reconnect** to the Host Hub without refreshing the page, since `hubConnected` is only set to `true` on initial profile load.

### Changes

#### 1. `src/pages/cowork/CoworkParticipantView.tsx`
- Add a `manuallyLeft` ref/state that is set to `true` when the user clicks hangup.
- When `manuallyLeft` is true, show a "Reconectar" button instead of the loading spinner, so the participant can rejoin their assigned room.
- The `useEffect` that auto-connects should skip when `manuallyLeft` is true.
- When the assignment changes (host moves participant to a different room), reset `manuallyLeft` to allow auto-connect to the new room.

#### 2. `src/pages/cowork/CoworkHostDashboard.tsx`
- Add a "Reconectar Hub" button that sets `hubConnected = true` when the host has disconnected from the Hub. Show it in the Host Hub indicator area (line 124-130) when `!hubConnected`.

### Files

| File | Change |
|------|--------|
| `src/pages/cowork/CoworkParticipantView.tsx` | Add `manuallyLeft` guard, show reconnect button |
| `src/pages/cowork/CoworkHostDashboard.tsx` | Add reconnect button for Host Hub |

