

## Plan: Default Mic & Camera Off in Cowork Module

### Problem
All `LiveKitCallView` instances in the Cowork module use the default `initialMicOn=true` and `initialCamOn=true`, so participants and hosts join with mic and camera already active.

### Changes

Add `initialMicOn={false}` and `initialCamOn={false}` to all three `LiveKitCallView` usages in the cowork module:

#### `src/pages/cowork/CoworkHostDashboard.tsx`
- **Line 325** (host entering a participant room): Add `initialMicOn={false} initialCamOn={false}`
- **Line 351** (Host Hub): Add `initialMicOn={false} initialCamOn={false}`

#### `src/pages/cowork/CoworkParticipantView.tsx`
- **Line 124** (participant room): Add `initialMicOn={false} initialCamOn={false}`

No other files need changes. The `LiveKitCallView` component already supports these props natively.

