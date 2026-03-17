

## Diagnosis: New host not seeing Host Dashboard

The issue has two parts:

### 1. Copy button only copies session ID, not a usable link
In `CoworkHostDashboard.tsx` line 83, the Copy button does:
```typescript
navigator.clipboard.writeText(cowork.session?.id || "");
```
This copies a raw UUID. The receiver has to manually go to `/cowork` and paste it. If they instead navigate to the Host Hub LiveKit room directly (e.g., via `/call/cowork_hub_xxx`), they land on `VideoCallPage` — a plain video call with no sidebar, no rooms panel, no host controls.

### 2. No detection of cowork rooms in VideoCallPage
`VideoCallPage` has no awareness of cowork rooms. If someone opens a cowork hub or cowork room URL via `/call/:roomName`, they see a generic video call UI instead of being redirected to the proper cowork dashboard.

## Plan

### 1. Fix Copy button to share full cowork URL (`CoworkHostDashboard.tsx`)
Change the copy action from copying the raw session ID to copying the full URL:
```
{window.location.origin}/cowork?session={sessionId}
```
This ensures any host who receives the link lands on the correct cowork page.

### 2. Add cowork room detection in VideoCallPage (`VideoCallPage.tsx`)
When `roomName` starts with `cowork_hub_` or `cowork_`, extract the session ID fragment and redirect to `/cowork?session=...`. This prevents users from accidentally joining cowork rooms as plain video calls.

To resolve the session ID from the room name prefix, query `cowork_sessions` or `cowork_rooms` for the matching `livekit_room_name` and redirect to the proper cowork URL.

### 3. Ensure lobby defaults to "host" when joining via shared host link (optional UX improvement)
Add a `role` query param support: `/cowork?session=xxx&role=host`. When present, the lobby auto-selects or highlights the host role, making it clearer for the invited co-host.

### Files to modify
- `src/pages/cowork/CoworkHostDashboard.tsx` — fix Copy to use full URL
- `src/pages/VideoCallPage.tsx` — detect cowork room names and redirect
- `src/pages/cowork/CoworkLobby.tsx` — optional: support `role` hint from URL

