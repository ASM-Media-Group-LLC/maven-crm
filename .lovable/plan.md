

## Plan: Move Room Cards into Main Content Area

### Problem
When no participant room is active, the main content area shows a useless placeholder ("Selecciona una sala para entrar"). Meanwhile, the room cards are crammed into the narrow left sidebar. The room cards should be displayed in the main content area when the host isn't in a room.

### Changes

#### `src/pages/cowork/CoworkHostDashboard.tsx`

1. **Remove the "Salas" section from the left sidebar** (lines 125-213) — move the room cards rendering logic out of the `<ScrollArea>`.

2. **Replace the empty-state placeholder** (lines 337-342) with the room cards grid. When `!activeRoomLk`, render the room cards in a responsive grid layout in the main content area (e.g., `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-6`). Each card keeps the same functionality (participants list, move selector, enter/leave button, copy link).

3. **Left sidebar keeps**: session header, Host Hub indicator, unassigned members, host requests, and screen share requests — all the management/notification items.

4. **Host Hub mini view** stays in the main content area below the room grid (or below the active room call when entered).

### Layout Summary

```text
┌──────────────┬──────────────────────────────────┐
│  Sidebar     │  Main Area                       │
│              │                                  │
│  Session hdr │  ┌─────────┐  ┌─────────┐       │
│  Host Hub ●  │  │ Sala 1  │  │ Sala 2  │       │
│  Unassigned  │  │ users.. │  │ empty   │       │
│  Requests    │  │ [Enter] │  │ [Enter] │       │
│  ScreenShare │  └─────────┘  └─────────┘       │
│              │                                  │
│              │  ── Host Hub mini view ────────  │
└──────────────┴──────────────────────────────────┘
```

When host clicks "Entrar" on a room, the room grid is replaced by the `LiveKitCallView` (current behavior preserved).

### Files

| Action | File |
|--------|------|
| Modify | `src/pages/cowork/CoworkHostDashboard.tsx` |

