

## Replace Move Controls with Media Status Icons in Room Cards

### Problem
Room cards in the Host Dashboard show move/reassign controls for each participant. The user wants these replaced with mic, camera, and screen share status indicators.

### Challenge
The host dashboard is not connected to each room's LiveKit instance, so it has no direct access to participant media state. A broadcast mechanism is needed.

### Approach
Use a **Supabase Realtime presence channel** scoped to the cowork session. Participants broadcast their media state (mic on/off, cam on/off, screenshare on/off) and the host dashboard subscribes to display it.

### Implementation

**1. New hook: `src/hooks/useCoworkMediaPresence.ts`**
- Creates a Supabase presence channel named `cowork-media-{sessionId}`
- Participants call `trackMediaState({ micOn, camOn, screenShareOn })` to broadcast
- Consumers read `mediaStates: Record<userId, { micOn, camOn, screenShareOn }>`

**2. Add `onMediaStateChange` callback to `LiveKitCallView`**
- New optional prop: `onMediaStateChange?: (state: { micOn: boolean; camOn: boolean; screenShareOn: boolean }) => void`
- Fires whenever the local participant's mic, cam, or screenshare state changes (derived from `useLiveKit` participants array)

**3. Update `CoworkParticipantView.tsx`**
- Use `useCoworkMediaPresence` to get `trackMediaState`
- Pass `onMediaStateChange` to `LiveKitCallView`, which calls `trackMediaState` on every change

**4. Update `CoworkHostDashboard.tsx`**
- Use `useCoworkMediaPresence` to get `mediaStates`
- In room card grid cells, replace the Select/move dropdown (lines 407-439) with three small icons:
  - `Mic`/`MicOff` — green/red based on mic state
  - `Video`/`VideoOff` — green/red based on cam state  
  - `Monitor` — shown only when screen sharing is active
- Remove `moveTarget` state and `ArrowRightLeft` import (no longer needed in cards)
- Keep the move functionality in the sidebar "Sin asignar" section unchanged

### Files modified
- `src/hooks/useCoworkMediaPresence.ts` — New hook (presence channel for media state)
- `src/pages/messenger/videocall/LiveKitCallView.tsx` — Add `onMediaStateChange` callback prop
- `src/pages/cowork/CoworkParticipantView.tsx` — Broadcast media state via presence
- `src/pages/cowork/CoworkHostDashboard.tsx` — Replace move controls with media status icons

