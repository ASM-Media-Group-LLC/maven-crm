

## Plan: Fix Screen Share Track Not Stopping on Session End

### Problem
When a cowork session ends while a participant is sharing their screen, the browser's screen-sharing indicator bar persists ("está compartiendo su pantalla"). The screen capture continues running even though the LiveKit room has been disconnected and the UI has been torn down.

### Root Cause
In livekit-client v2.x, `Room.disconnect()` does **not** stop local tracks by default. It only closes the WebSocket connection. To also stop the underlying `MediaStreamTrack` (which releases the browser's screen capture), you must call `Room.disconnect(true)`.

There are **4 call sites** in `useLiveKit.ts` that call `.disconnect()` without passing `true`:

1. **Line 814** — reconnect guard (when connecting to a new room while already connected)
2. **Line 1044** — moderation kick (removed by admin)
3. **Line 1164** — explicit `disconnect()` function
4. **Line 1457** — cleanup on unmount

### Change

**File: `src/hooks/useLiveKit.ts`**
- Change all 4 `.disconnect()` calls to `.disconnect(true)` so that all local tracks (including screen share) are fully stopped, releasing the browser capture.

No other files affected. No orphan code.

