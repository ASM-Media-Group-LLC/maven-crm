

## Plan: Fix Screen Share Persisting After Cowork Session Ends

### Problem
When the host ends a cowork session while sharing their screen, the browser's screen-sharing indicator ("está compartiendo tu pantalla") persists. This happens because:

1. In `CoworkHostDashboard`, the "End Session" handler sets `setActiveRoomLk(null)` and `setHubConnected(false)` synchronously, which unmounts the `LiveKitCallView` components
2. The unmount cleanup calls `lk.disconnect()`, but `room.disconnect(true)` is asynchronous — it needs time to stop all MediaStreamTracks
3. `navigate("/cowork")` fires immediately after, tearing down the component tree before the async track cleanup completes
4. The screen share MediaStreamTrack is never properly stopped, so the browser keeps showing the capture indicator

### Solution

**`src/pages/cowork/CoworkHostDashboard.tsx`** — Fix the "End Session" handler

Replace the current fire-and-forget approach with a proper sequential cleanup:

1. Before changing any state, grab the current `LiveKitCallView`'s room instance and explicitly stop screen share and disconnect
2. Introduce a ref to the `useLiveKit` `disconnect` function from the active room/hub views so the host dashboard can call it directly
3. Alternatively (simpler): **don't unmount** the LiveKit views before disconnecting — instead, call `endSession()` first, let the realtime subscription trigger the session-ended screen which handles the unmount naturally

The simplest robust fix:
- Remove the state resets (`setActiveRoomLk(null)`, `setHubConnected(false)`) from *before* `endSession()`
- Call `await cowork.endSession()` first
- The realtime subscription will set `session.status = "ended"`, which causes `CoworkPage` to render the "session ended" screen
- This unmounts `CoworkHostDashboard` → unmounts `LiveKitCallView` → cleanup calls `lk.disconnect()` with `room.disconnect(true)`
- Add a small delay or wait before navigating to ensure cleanup completes
- As a safety net, in `useLiveKit`'s `disconnect` function, explicitly stop all local tracks' `MediaStreamTrack`s before calling `room.disconnect(true)` to guarantee browser releases screen capture

### Changes

**1. `src/pages/cowork/CoworkHostDashboard.tsx`** (End Session handler ~line 175)
- Reorder: call `await cowork.endSession()` first, then a brief `await` (200ms) for realtime propagation, then navigate
- Remove premature state resets (`setActiveRoomLk(null)`, `setHubConnected(false)`) — let unmount handle them naturally via the session-ended render path

**2. `src/hooks/useLiveKit.ts`** (disconnect function ~line 1153)
- Before calling `room.disconnect(true)`, explicitly stop all local participant's MediaStreamTracks:
  ```
  room.localParticipant.videoTrackPublications.forEach(pub => {
    pub.track?.mediaStreamTrack?.stop();
  });
  room.localParticipant.audioTrackPublications.forEach(pub => {
    pub.track?.mediaStreamTrack?.stop();
  });
  ```
- This guarantees the browser releases camera/mic/screen-share indicators even if `room.disconnect()` is interrupted

### Files Modified
- `src/pages/cowork/CoworkHostDashboard.tsx` — reorder end-session cleanup
- `src/hooks/useLiveKit.ts` — force-stop MediaStreamTracks before disconnect

