

## Audit: 1:1 and Simple Host Request Coexistence

### Problem

Currently, **every** host request generates a `oneone_livekit_room` and the participant auto-enters a 1:1 call. There's no way to just "raise a hand" without starting a video call. The original simple notification flow was replaced entirely.

### Solution

Split into two distinct actions for the participant:
- **"Pedir host"** — Simple notification (no 1:1 room). Host sees it in sidebar, can acknowledge/resolve.
- **"Llamar host"** — Creates a 1:1 temporary room. Both enter a video call.

### Changes

#### 1. Edge Function (`cowork-session/index.ts`)

- **`requestHost`**: Only generate `oneone_livekit_room` when the request includes `requestOneOnOne: true`. Otherwise insert with `oneone_livekit_room: null`.

#### 2. Participant View (`CoworkParticipantView.tsx`)

- **Two buttons**:
  - `Hand` icon → "Pedir host" — calls `requestHost(roomId, message)` WITHOUT `requestOneOnOne`. No overlay opens.
  - `Phone` icon → "Llamar host" — calls `requestHost(roomId, message, true)` WITH `requestOneOnOne`. Opens the 1:1 overlay as it does today.
- Disable both while an open/acknowledged request exists (duplicate prevention already works server-side).
- Auto-restore effect already checks `r.oneone_livekit_room` — no change needed.
- Auto-close effect already works — no change needed.

#### 3. Hook (`useCoworkSession.ts`)

- Update `requestHost` signature to accept optional `requestOneOnOne?: boolean` parameter and pass it to the edge function.

#### 4. Host Dashboard (`CoworkHostDashboard.tsx`)

- For requests **without** `oneone_livekit_room`: Show "Atender" (ack only, no 1:1 join) + "Resolver". Clicking "Atender" just acknowledges — host can optionally enter the participant's room via the existing "Entrar" button on the room card.
- For requests **with** `oneone_livekit_room`: Keep current behavior — "Atender" joins 1:1, "Unirse 1:1" for re-entry, "Resolver" closes.
- Visual distinction: different icon/color for 1:1 requests vs simple requests.

### Files Modified
- `supabase/functions/cowork-session/index.ts` — conditional `oneone_livekit_room` generation
- `src/hooks/useCoworkSession.ts` — add `requestOneOnOne` param to `requestHost`
- `src/pages/cowork/CoworkParticipantView.tsx` — two buttons, conditional overlay
- `src/pages/cowork/CoworkHostDashboard.tsx` — differentiate request types in sidebar

