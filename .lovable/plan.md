

## Fix: "Client initiated disconnect" Error on Private Call Button Click

### Root Cause

When the participant clicks "Llamada privada con host", this sequence causes the error:

1. `requestHost` API inserts the request into the DB and returns the room name + request ID
2. State updates: `oneOnOneRequestId`, `oneOnOneRoom` are set → 1:1 LiveKitCallView mounts and starts connecting
3. The DB insert triggers a Supabase realtime event → `fetchData(true)` starts (async refetch)
4. **Before the refetch completes**, the auto-close effect (line 107-121) runs with the OLD `hostRequests` list
5. `cowork.hostRequests.find(r => r.id === oneOnOneRequestId)` returns `undefined` — the new request isn't in the stale list yet
6. The `!req` branch (line 115) fires → `reconnectToMainRoom()` → clears `oneOnOneRoom` → 1:1 LiveKitCallView **unmounts mid-connect**
7. The cleanup `lk.disconnect()` fires while `room.connect()` is in progress → LiveKit SDK throws "Client initiated disconnect"

```text
Click button → requestHost API → state set → 1:1 mounts & connects
                                            ↓
                        Realtime fires → fetchData(true) starts...
                                            ↓
                     Auto-close effect runs with STALE hostRequests
                                            ↓
                       !req → reconnectToMainRoom() → unmount!
                                            ↓
                      lk.disconnect() during connect → ERROR
```

The same bug exists in `CoworkHostDashboard.tsx` line 105.

### Secondary Issue

`autoLeaveOnEmpty={3000}` on the 1:1 view kicks the participant out after 3 seconds if the host hasn't joined yet. This is wrong for private calls — the participant should wait for the host. The auto-leave should only fire after a remote participant has been seen and then left (room was populated then emptied), not when no one has ever joined.

### Fixes

**`src/pages/cowork/CoworkParticipantView.tsx`**:

1. **Add `oneOnOneSeenInListRef`** — tracks whether we've ever seen the 1:1 request in `hostRequests`. The `!req` auto-close branch only fires if we've previously seen the request in the list (meaning it truly disappeared, not that it hasn't arrived yet).

2. **Remove `autoLeaveOnEmpty` from the 1:1 LiveKitCallView** — the participant should wait for the host indefinitely. The auto-close effect already handles cleanup when the host resolves the request. Keep `autoLeaveOnEmpty` only if we track "was populated" state, but that adds complexity for little benefit in 1:1 calls where the auto-close via Supabase already works.

**`src/pages/cowork/CoworkHostDashboard.tsx`**:

3. **Same `seenInList` guard for the host's auto-close effect** (line 102-110) — prevent premature cleanup on stale data.

**`src/pages/messenger/videocall/LiveKitCallView.tsx`**:

4. **Enhance `autoLeaveOnEmpty` to only fire after room was populated** — add a ref tracking whether at least one remote participant was ever seen. Only start the empty-room timer after that ref is true. This makes it safe for all use cases.

### Implementation Detail

```typescript
// CoworkParticipantView.tsx — new ref
const oneOnOneSeenInListRef = useRef(false);

// Reset when entering 1:1
// (in button handler and reconnect handler)
oneOnOneSeenInListRef.current = false;

// Track when we first see it
useEffect(() => {
  if (!oneOnOneRequestId) { oneOnOneSeenInListRef.current = false; return; }
  const req = cowork.hostRequests.find(r => r.id === oneOnOneRequestId);
  if (req) oneOnOneSeenInListRef.current = true;
  // Only auto-close if we've seen it before and it's now gone/resolved
  if (!oneOnOneSeenInListRef.current) return;
  if (req?.status === "resolved" || !req) {
    reconnectToMainRoom();
    toast.info("Llamada privada con host finalizada");
  }
}, [cowork.hostRequests, oneOnOneRequestId, reconnectToMainRoom]);
```

```typescript
// LiveKitCallView.tsx — autoLeaveOnEmpty fix
const hadRemoteParticipantRef = useRef(false);

useEffect(() => {
  if (!autoLeaveOnEmpty || lk.connectionState !== ConnectionState.Connected) return;
  const remoteCount = lk.participants.filter(p => !p.isLocal).length;
  if (remoteCount > 0) { hadRemoteParticipantRef.current = true; return; }
  if (!hadRemoteParticipantRef.current) return; // Never had anyone, don't auto-leave
  const timer = setTimeout(() => handleLeaveRef.current(), autoLeaveOnEmpty);
  return () => clearTimeout(timer);
}, [autoLeaveOnEmpty, lk.participants, lk.connectionState]);

// Reset on roomName change
useEffect(() => { hadRemoteParticipantRef.current = false; }, [roomName]);
```

### Files Modified
- `src/pages/cowork/CoworkParticipantView.tsx` — Add seen-in-list guard, remove redundant auto-close branch
- `src/pages/cowork/CoworkHostDashboard.tsx` — Same seen-in-list guard
- `src/pages/messenger/videocall/LiveKitCallView.tsx` — `autoLeaveOnEmpty` only after room was populated

