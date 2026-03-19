

## Fix: 1:1 Call Audio Bleeds from Main Room

### Problem
When a participant starts a 1:1 call with the host, both LiveKit connections run simultaneously — the main breakout room AND the 1:1 overlay. This causes audio from other participants in the main room to bleed into the 1:1 conversation, making it unusable.

### Solution: Full-Screen Takeover Instead of Overlay
Replace the floating popup with a **full-screen takeover**. When a 1:1 call is active:
1. **Disconnect** from the main breakout room (set `connectedLkRoom` to `null`)
2. **Show the 1:1 call full-screen** in the same main video area
3. Display a banner indicating "1:1 con Host" with a hang-up button
4. When the 1:1 ends, **auto-reconnect** to the main breakout room

This eliminates the dual-connection audio problem entirely.

### Implementation

**`src/pages/cowork/CoworkParticipantView.tsx`** — Single file change:

1. When `oneOnOneRoom` becomes active, set `connectedLkRoom = null` to unmount the main room's LiveKitCallView
2. In the main video area, add a conditional: if `isInOneOnOne`, render the 1:1 LiveKitCallView full-screen (with a distinctive header bar showing Crown icon + "1:1 con Host" + hang-up button) instead of the breakout room
3. On 1:1 end (`onLeave` / close), restore `connectedLkRoom` back to `myRoom.livekit_room_name` to auto-reconnect
4. **Remove** the floating overlay div entirely (lines 287-334)
5. Update the top bar to show "En llamada 1:1 con Host" when active, disabling room-specific actions

### Flow
```text
Participant in Room A  →  Clicks "Llamar host"
  └─ Main room disconnects
  └─ 1:1 call renders full-screen
  └─ Top bar shows "1:1 con Host" context

Either party hangs up  →  1:1 request resolved
  └─ 1:1 unmounts
  └─ Main room auto-reconnects
```

### File modified
- `src/pages/cowork/CoworkParticipantView.tsx`

