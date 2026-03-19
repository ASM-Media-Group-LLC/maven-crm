

## Fix: "Notification Changes Name" During Private Call Entry

### Root Cause

When the participant clicks "Llamada privada con host", React **reuses** the existing `LiveKitCallView` component instance (same position, same type in the ternary). The old instance's `useLiveKit` hook carries over stale state — during the disconnect→reconnect transition, the `CallTopBar` briefly flashes the old room name before updating to the new `callDisplayName`. This happens because both branches of the ternary render `LiveKitCallView` at the same JSX position, so React reconciles via prop update instead of clean unmount/mount.

Additionally, on the **host side**, the same reuse issue exists — when the host clicks "Atender" while already in a breakout room, the LiveKitCallView is reused with new props, causing a brief name flash.

### Solution: Add `key` Props for Clean Component Lifecycle

Force React to **unmount** the old instance and **mount** a fresh one by adding unique `key` props to each `LiveKitCallView`. This ensures no stale LiveKit connection state carries over between room switches.

### Changes

**`src/pages/cowork/CoworkParticipantView.tsx`**:
- Add `key={`oneOnOne-${oneOnOneRoom}`}` to the 1:1 LiveKitCallView (line 280)
- Add `key={`room-${connectedLkRoom}`}` to the main room LiveKitCallView (line 298)

**`src/pages/cowork/CoworkHostDashboard.tsx`**:
- Add `key={activeRoomLk}` to the main area LiveKitCallView (line 369)
- This ensures clean mount when switching between breakout rooms or between breakout↔1:1

### Files Modified
- `src/pages/cowork/CoworkParticipantView.tsx` — 2 key props added
- `src/pages/cowork/CoworkHostDashboard.tsx` — 1 key prop added

