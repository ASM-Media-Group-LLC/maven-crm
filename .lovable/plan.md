

## Audit: "Llamar host" — Ghost Participants in 1:1 Room

### Root Cause

Every call to `joinOneOnOne` in the edge function generates a **random identity**:
```
const identity = `${userId}_${crypto.randomUUID().slice(0, 8)}`;
```

LiveKit identifies participants by their `identity`. If the token provider is called more than once (due to component remounts, race between onClick handler and auto-restore effect, or page navigation), each call creates a **different identity** — LiveKit sees them as separate participants. The old participant lingers until the server cleans it up, causing 2 (or more) ghost entries in the small 1:1 room.

This same pattern exists across **all** token issuance paths in the edge function (`join_host_hub`, `join_room`, `joinOneOnOne`, `claimScreenShareToken`), but it's most visible in the 1:1 room because it's a 2-person room.

### Fix

**Edge Function (`cowork-session/index.ts`)**: Replace all random identity generation with **stable, deterministic identities** scoped by purpose:

- `joinOneOnOne`: `userId` (only 2 people in this room, no collision)
- `join_room`: `userId` (one user per cowork room at a time)
- `join_host_hub`: `userId` (one host identity per hub)
- `claimScreenShareToken`: `userId` (same user reconnecting with elevated permissions)

This way, if the token is requested multiple times, LiveKit treats it as the **same participant reconnecting**, not a new one. The old connection is replaced instead of duplicated.

### Additional Safety: Prevent Double-Mount Race

**Participant View (`CoworkParticipantView.tsx`)**: The "Llamar host" onClick handler and the auto-restore effect can race. The onClick `await`s the API call, during which realtime delivers the new request to the auto-restore effect, which sees `oneOnOneRequestId === null` and mounts the overlay. Then the onClick sets state with the same values — no remount, but the overlay already called `getOneOnOneToken` once via auto-restore.

Fix: In the onClick handler, set `oneOnOneRequestId` **before** awaiting `requestHost` (use a ref or set a "pending" flag) so the auto-restore effect doesn't race. Simplest approach: set a `pendingOneOnOneRef` before the await, and check it in the auto-restore effect.

### Files Modified
- `supabase/functions/cowork-session/index.ts` — Replace random identities with stable `userId`-based identities across all token paths
- `src/pages/cowork/CoworkParticipantView.tsx` — Add race condition guard for "Llamar host" onClick vs auto-restore effect

