

## Plan: Fix Screen Share Blackout in Cowork Rooms

### Problem
When a participant shares their screen in a Cowork room (both host and participant views), a "blackout" occurs — the screen share tile appears but shows no video. This is caused by a race condition between the participant state refresh and the actual track subscription/availability.

### Root Cause

1. **Race condition in tile splitting**: When `refreshParticipants()` fires (via `debouncedRefresh` on `TrackPublished`), it creates a synthetic screen-share tile before the `TrackSubscribed` event fires. The `ParticipantTile` tries to attach the track, finds it null, and shows a black rectangle.

2. **Insufficient retry trigger**: The retry mechanism in `ParticipantTile` (lines 200-213) retries attachment based on initial render timing, but the `useEffect` dependency array doesn't include `participant.isMuted` or track-level changes that would re-trigger when the track actually becomes available after subscription.

3. **Missing `TrackSubscribed` → tile re-render bridge**: The `debouncedRefresh()` on `TrackSubscribed` updates the participant list, but the memo comparison (`areParticipantPropsEqual`) may return `true` since none of the compared fields change (the `isScreenSharing` was already `true` from the `TrackPublished` event). This means `ParticipantTile` doesn't re-render when the track actually becomes attachable.

### Changes

**File: `src/pages/messenger/videocall/ParticipantTile.tsx`**

1. Add a `trackRevision` counter prop to `ParticipantTile` that gets bumped each time `refreshParticipants` runs, ensuring tiles re-run their video attachment effect when tracks change.

Actually — simpler approach: Add a `trackAttached` boolean field to `LKParticipant` that reflects whether the relevant video track (Camera or ScreenShare) has a subscribed track available. Include it in the memo comparison and the effect dependency array.

**File: `src/hooks/useLiveKit.ts`**

2. In `buildParticipant()`, add a `hasVideoTrack` field that checks if the relevant video source track is subscribed and available (not just published). This field will change from `false` → `true` when `TrackSubscribed` fires, causing `ParticipantTile` to re-render and re-attach.

3. In `refreshParticipants()` tile splitting: propagate the `hasVideoTrack` field correctly for each split tile (screen tile checks ScreenShare track, camera tile checks Camera track).

**File: `src/pages/messenger/videocall/ParticipantTile.tsx`**

4. Add `participant.hasVideoTrack` to `areParticipantPropsEqual` so memo allows re-render when track availability changes.
5. Add `participant.hasVideoTrack` to the video attachment `useEffect` dependency array to re-trigger attachment when the track becomes available.

### Detailed Implementation

**`src/hooks/useLiveKit.ts` — `LKParticipant` interface (line 19)**
- Add `hasVideoTrack: boolean`

**`src/hooks/useLiveKit.ts` — `buildParticipant()` (line 289)**
- Compute whether the primary video track (Camera) and screen share track each have a subscribed, non-null `.track`:
```ts
const hasCameraTrack = !!videoTrack?.track && !videoTrack.isMuted;
const hasScreenTrack = !!screenTrack?.track && !screenTrack.isMuted;
// hasVideoTrack = true if either source that showVideo would use is available
hasVideoTrack: isScreenSharing ? hasScreenTrack : hasCameraTrack,
```

**`src/hooks/useLiveKit.ts` — `refreshParticipants()` tile splitting (line 354-372)**
- For screen tile: set `hasVideoTrack` based on screen track availability
- For camera tile: set `hasVideoTrack` based on camera track availability
- This requires `buildParticipant` to return both values, so add `hasCameraTrack` and `hasScreenTrack` internal fields, then map to `hasVideoTrack` during splitting.

**`src/pages/messenger/videocall/ParticipantTile.tsx` — memo comparison (line 35)**
- Add `prevP.hasVideoTrack === nextP.hasVideoTrack`

**`src/pages/messenger/videocall/ParticipantTile.tsx` — video effect deps (line 216)**
- Add `participant.hasVideoTrack` to the dependency array

**`src/test/videocall/LiveKitCallView.test.tsx`**
- Add `hasVideoTrack: false` to `makeParticipant()` default

### Files Modified
- `src/hooks/useLiveKit.ts` — Add `hasVideoTrack` to `LKParticipant`, compute in `buildParticipant`, propagate in tile splitting
- `src/pages/messenger/videocall/ParticipantTile.tsx` — Add to memo + effect deps
- `src/test/videocall/LiveKitCallView.test.tsx` — Update test mock

### No Orphan Code
No dead code introduced. The new field is consumed by the memo and effect.

