

## Fix: Host Hub Stays Connected When Minimized

### Problem
When the Host Hub is minimized, the `LiveKitCallView` component is unmounted (replaced by a small "Hub" button). This disconnects the host from the Hub's LiveKit room. The user wants minimize to only hide the video UI while keeping the connection alive in the background.

### Fix

**`src/pages/cowork/CoworkHostDashboard.tsx`** — Restructure the floating Hub popup (lines 463-534):

- Always render the full Hub container (with `LiveKitCallView`) when `hubConnected` is true
- When minimized: hide the main container with `hidden` class, and show the small "Hub" button alongside it
- When expanded: show normally as today

This ensures the LiveKit connection persists across minimize/restore cycles. The X (close) button remains the only way to fully disconnect.

### Technical detail

Replace the current conditional render (`hubMinimized ? <Button> : <div with LiveKit>`) with:
1. Always render the LiveKit container, applying `hidden` when minimized
2. Render the minimized button when `hubMinimized` is true
3. Both exist in the DOM simultaneously; only visibility toggles

### File modified
- `src/pages/cowork/CoworkHostDashboard.tsx` — Lines 463-534

