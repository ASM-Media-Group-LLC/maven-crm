

## Plan: Host Hub as Floating Pop-up Window

### Approved approach (with performance audit)

Convert the Host Hub from a docked bottom panel into a floating, minimizable pop-up window that persists even when the host enters an active room.

### Performance Analysis

**Key concern: Two simultaneous LiveKit connections** when the host enters a room while the Hub is open.

Each `LiveKitCallView` instantiates its own `useLiveKit()` hook, which creates an independent `Room` object — meaning two full WebRTC peer connections, two sets of media tracks, and two event listener trees running concurrently.

**Mitigations already in place:**
- Hub initializes with `initialMicOn={false}` and `initialCamOn={false}` — so the Hub connection is receive-only (no outbound media tracks), which is lightweight.
- Active room also starts with mic/cam off by default.

**Additional safeguards to implement:**
- When the host enters an active room, **auto-minimize the Hub pop-up** to reduce DOM rendering (hidden `LiveKitCallView` still maintains connection but skips video tile rendering).
- Add a `hidden` prop or CSS `display:none` on the Hub's video grid when minimized — this prevents the browser from decoding/rendering video frames while maintaining the signaling connection.
- Keep the Hub's LiveKit connection alive but with **no subscribed video tracks when minimized** — audio-only presence is very cheap (~5-10 kbps).

**Resource impact (worst case, both connections active and visible):**
- ~2 WebSocket connections (~negligible)
- ~2 sets of audio/video decoders (only significant if Hub has many participants with cameras on)
- For a typical Hub with 1-3 hosts, this is well within browser capability

### Changes

#### `src/pages/cowork/CoworkHostDashboard.tsx`

1. **Add state:** `hubMinimized` (boolean, defaults to `false`).

2. **Remove** the current docked Hub section (lines 397-418).

3. **Add floating pop-up** (rendered outside the flex layout, at component root level):
   - `fixed bottom-4 right-4 z-50`
   - When expanded: ~384×280px card with title bar (Crown icon + "Host Hub"), minimize button (−), close button (×)
   - Body: existing `LiveKitCallView` with same props
   - When minimized: small pill button (Crown icon + "Hub" text) that expands on click

4. **Remove `!activeRoomLk` condition** — Hub renders whenever `hubConnected` is true, regardless of active room state.

5. **Auto-minimize on room entry:** In `enterRoom`, set `hubMinimized = true`.

6. **Performance guard:** When `hubMinimized` is true, wrap the `LiveKitCallView` in a `div` with `className="hidden"` to prevent video rendering while keeping the connection alive. When expanded, remove the `hidden` class.

7. **Sidebar indicator:** Update the Hub indicator section to toggle `hubMinimized` when clicked (if connected).

No other files need changes. No new dependencies. No network/backend changes.

