

## Problem

Currently, participants join a session generically and wait for the host to assign them to a room. The user wants:
1. Each room (sala) has its own participant invite link
2. Participants join directly into a specific room — no host assignment needed
3. The participant invite button moves from the header to each room card

## Plan

### 1. Edge Function: Add `roomId` to `joinSession` for auto-assignment (`cowork-session/index.ts`)

When a participant joins with a `roomId`:
- Create their membership as usual
- Immediately create a `cowork_room_assignments` record for that room (auto-assign)
- This eliminates the "waiting for host assignment" step for participants

```
joinSession({ sessionId, role, hostCode, roomId })
  → if role !== "host" && roomId:
      insert membership + insert room_assignment in one go
```

### 2. Host Dashboard: Move participant invite to room cards (`CoworkHostDashboard.tsx`)

- **Remove** the blue `Users2` participant invite button from the header (line 100-112)
- **Add** a copy-participant-link button on each room card, which copies: `{origin}/cowork?session={id}&room={roomId}`
- Keep the host invite button (Crown) in the header

### 3. Lobby: Handle room-specific join (`CoworkLobby.tsx`)

- Read `room` param from URL in addition to `session` and `role`
- Pass `roomId` to `onJoin` callback
- When no `role` param (participant link with room): show only "Unirse como participante" and auto-join into that room

### 4. CoworkPage: Pass roomId through join flow (`CoworkPage.tsx`)

- Read `room` search param from URL
- Pass it to `CoworkLobby` and through `joinSession`

### 5. Hook: Update `joinSession` to accept `roomId` (`useCoworkSession.ts`)

- Add `roomId` parameter to `joinSession` call

### 6. Participant View: Remove "waiting for assignment" state (`CoworkParticipantView.tsx`)

- Since participants are auto-assigned on join, the "Esperando asignación" state should rarely appear (only edge case of direct API call without room)

### Files to modify
- `supabase/functions/cowork-session/index.ts` — auto-assign on join when roomId provided
- `src/pages/cowork/CoworkHostDashboard.tsx` — move participant link to room cards, remove from header
- `src/pages/cowork/CoworkLobby.tsx` — handle `room` URL param
- `src/pages/cowork/CoworkPage.tsx` — read `room` param, pass through
- `src/hooks/useCoworkSession.ts` — add `roomId` to `joinSession`

