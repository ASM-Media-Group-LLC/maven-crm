

## Plan: 1:1 Temporary Room on Host Request

### Overview

When a participant clicks "Pedir host", both the participant and host enter a temporary 1:1 LiveKit room for direct communication.

### Flow

```text
Participant clicks "Pedir host"
  → Edge function creates host_request with a temporary LK room name
  → Participant auto-connects to the 1:1 room (overlay on top of current view)
  
Host sees request in sidebar
  → Clicks "Atender" → joins the same 1:1 room (in main content area)
  
Either side leaves / Host clicks "Resolver"
  → Both return to their normal views
```

### Changes

#### 1. Database migration
- Add column `oneone_livekit_room TEXT` to `cowork_host_requests`.

#### 2. Edge function (`supabase/functions/cowork-session/index.ts`)

- **`requestHost` action**: Generate a temporary room name (`cowork_1on1_{sessionId.slice(0,8)}_{requestId.slice(0,8)}`) and store it in the new column. Return it in the response.
- **New `joinOneOnOne` action**: Takes `requestId`. Validates caller is either the requesting participant or a session host. Issues a LiveKit token for the `oneone_livekit_room` with full publish permissions. Returns `{ token, url, room }`.
- **`resolveHostRequest` action**: No change needed (existing status update suffices; clients detect resolved status via realtime).

#### 3. Hook (`src/hooks/useCoworkSession.ts`)

- Add `joinOneOnOne` callback wrapping `invokeCowork("joinOneOnOne", { requestId })`.
- Update `HostRequest` interface to include `oneone_livekit_room?: string`.

#### 4. Participant view (`src/pages/cowork/CoworkParticipantView.tsx`)

- After `requestHost` succeeds, store the returned `oneone_livekit_room` and `requestId` in state.
- Render a **floating overlay** `LiveKitCallView` for the 1:1 room (similar to the Host Hub pop-up: fixed, bottom-right, ~480px wide) on top of the existing room view.
- Add a `getOneOnOneToken` callback that calls `cowork.joinOneOnOne(requestId)`.
- On leave or when the host request status changes to `resolved` (detected via realtime), close the overlay and clear state.
- Disable the "Pedir host" button while a 1:1 session is active.

#### 5. Host dashboard (`src/pages/cowork/CoworkHostDashboard.tsx`)

- **"Atender" button**: Instead of just calling `ackHostRequest`, also acknowledge the request AND enter the 1:1 room by setting `activeRoomLk` to the request's `oneone_livekit_room` and using a new `getOneOnOneToken` callback.
- Add a `getOneOnOneToken` provider that calls `cowork.joinOneOnOne(activeOneOnOneRequestId)`.
- When leaving the 1:1 room or resolving the request, return to the normal room grid view.
- Show visual indicator that the host is in a 1:1 session.

### Files Modified
- `cowork_host_requests` table — add `oneone_livekit_room` column (SQL migration)
- `supabase/functions/cowork-session/index.ts` — update `requestHost`, add `joinOneOnOne`
- `src/hooks/useCoworkSession.ts` — add `joinOneOnOne`, update interface
- `src/pages/cowork/CoworkParticipantView.tsx` — 1:1 overlay after requesting host
- `src/pages/cowork/CoworkHostDashboard.tsx` — "Atender" joins 1:1 room

