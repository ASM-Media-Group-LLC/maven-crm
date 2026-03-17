

## Hide Screen Share Button & Fix Screen Share Request Flow

### Problem
1. **Participant's LiveKit `CallControls`** shows a "Compartir pantalla" button that doesn't work — their token restricts publishing to camera/microphone only (`canPublishSources: ["camera", "microphone"]`).
2. **Screen share approval is broken**: When the host approves a request, the new token (with screen share permission) is returned in the host's API response. The participant has no way to receive it — there's no mechanism to deliver the approved token to the participant.

### Changes

**1. Add `hideScreenShare` prop to `CallControls` and `LiveKitCallView`**

- Add optional `hideScreenShare?: boolean` to both components
- When true, hide the screen share `ControlBtn` in `CallControls`
- Pass from `LiveKitCallView` → `CallControls`

**2. `CoworkParticipantView.tsx` — pass `hideScreenShare={true}` to `LiveKitCallView`**

This removes the non-functional native screen share button from the participant's video controls.

**3. Fix the screen share approval flow — participant polls for approval**

The participant already sees realtime updates on `cowork_screenshare_requests`. When their request status changes to `"approved"`, we need to:
- Detect the change in `CoworkParticipantView`
- Call a new edge function action `claimScreenShareToken` to get a fresh token with screen share permissions
- Reconnect to the LiveKit room with the new token (or use `useLiveKit` to update permissions)

**New edge function action: `claimScreenShareToken`**
- Participant calls with their approved request ID
- Server verifies the request is approved and belongs to the caller
- Returns a new LiveKit token with `canPublish: true` (no source restrictions)
- Marks the request as `"claimed"` to prevent reuse

**Participant view changes:**
- Watch `cowork.screenShareRequests` for own request changing to `"approved"`
- Auto-call `claimScreenShareToken`, get new token
- Reconnect LiveKit with the new token (which allows screen sharing)
- Show toast: "Pantalla compartida aprobada"

**4. Update the "Compartir pantalla" button in participant top bar**

Currently the top-bar button sends the request but has no follow-through. After approval detection and token claim, enable native screen share via LiveKit.

### Files to modify
- `src/pages/messenger/videocall/CallControls.tsx` — add `hideScreenShare` prop
- `src/pages/messenger/videocall/LiveKitCallView.tsx` — pass `hideScreenShare` through
- `src/pages/cowork/CoworkParticipantView.tsx` — pass prop + add approval detection logic
- `src/hooks/useCoworkSession.ts` — add `claimScreenShareToken` action
- `supabase/functions/cowork-session/index.ts` — add `claimScreenShareToken` action
- `src/test/videocall/CallControls.test.tsx` — test hideScreenShare prop

