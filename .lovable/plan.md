

## Fix: Mic/Cam Always Off in Cowork Module

### Problem
Two places start with microphone ON, violating the "always off" rule for the Cowork module:

1. **`CoworkParticipantView.tsx` line 309**: The 1:1 overlay `LiveKitCallView` has `initialMicOn={true}`
2. **`CoworkHostDashboard.tsx` line 370**: The host's active room view has `initialMicOn={!!oneOnOneRoom}` (evaluates to `true` when in a 1:1 call)

Camera is already `false` everywhere — no changes needed there.

### Fix
- **`CoworkParticipantView.tsx`**: Change `initialMicOn={true}` → `initialMicOn={false}` (line 309)
- **`CoworkHostDashboard.tsx`**: Change `initialMicOn={!!oneOnOneRoom}` → `initialMicOn={false}` (line 370)

### Files Modified
- `src/pages/cowork/CoworkParticipantView.tsx` — 1 line change
- `src/pages/cowork/CoworkHostDashboard.tsx` — 1 line change

