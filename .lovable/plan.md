

## Audit: Realtime User Status in Cowork Module

### Current State

The realtime flow works through `useCoworkSession`, which subscribes to 6 postgres_changes channels (sessions, rooms, assignments, memberships, host requests, screen share requests). Every change triggers a full `fetchData()` refetch.

After auditing all files against the recent changes (end session, hangup/reconnect, direct room join), the **data synchronization** is correct:

- **Session ended**: Realtime updates `session.status` → `CoworkPage` renders "ended" screen → unmounts LiveKit views → cleanup via unmount. **Works.**
- **Participant moved**: Assignment changes → realtime refetch → `myAssignment` updates → `CoworkParticipantView` detects room change, resets `manuallyLeft`, auto-connects. **Works.**
- **New member joins**: Membership insert → realtime refetch → host dashboard re-renders with new member. **Works.**
- **Manual hangup + reconnect**: `manuallyLeft` state prevents auto-reconnect loop, reset on room change. **Works.**

### Issue Found: No Online Presence Indicators

The cowork module **does not use `useOnlinePresence`** at all. The host dashboard shows participant names but has **no indication** of who is actually online/connected vs. who has closed their browser. This is critical for a host managing rooms — they can't distinguish between an active participant and one who left.

### Plan

#### 1. `src/pages/cowork/CoworkHostDashboard.tsx`
- Import and use `useOnlinePresence` hook
- Add a green/gray dot next to each participant name in:
  - **Room cards** (line 282-283): next to assigned participant names
  - **Unassigned members list** (line 152): next to unassigned participant names

#### 2. `src/pages/cowork/CoworkParticipantView.tsx`
No changes needed — participant view doesn't display other users' names.

### Implementation Detail

```tsx
// In CoworkHostDashboard
import { useOnlinePresence } from "@/hooks/useOnlinePresence";

// Inside component
const { isOnline } = useOnlinePresence();

// Next to each participant name (both in room cards and unassigned list)
<span className={`h-2 w-2 rounded-full ${isOnline(userId) ? "bg-green-400" : "bg-white/20"}`} />
<span className="text-white/70">{cowork.profiles[userId] || "User"}</span>
```

### Files

| File | Change |
|------|--------|
| `src/pages/cowork/CoworkHostDashboard.tsx` | Add online presence dots next to all participant names |

