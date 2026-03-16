

## Plan: Client-Side Noise Cancellation with RNNoise

### Context
Your current setup already uses the browser's built-in `noiseSuppression: true` in `audioCaptureDefaults`, but this is basic and varies by browser. For professional-grade noise cancellation on a self-hosted LiveKit, we'll integrate **RNNoise** via an AudioWorklet that processes the microphone stream in real-time before it reaches LiveKit.

### Architecture

```text
Mic → MediaStreamTrack → AudioWorklet (RNNoise WASM) → Processed Track → LiveKit publish
```

The RNNoise WASM model runs entirely client-side in an AudioWorklet thread, so it doesn't block the main thread and adds minimal latency (~10ms).

### Implementation

**1. Add RNNoise WASM library**
- Install `@nicedoc/rnnoise-wasm` (or bundle the open-source RNNoise WASM build from `nicedoc/rnnoise-wasm`). If no suitable npm package is available, we'll use the `rnnoise-wasm` package which provides the WASM binary and a JS wrapper.
- Alternative: use `@jitsi/rnnoise-wasm` which is well-maintained and used by Jitsi Meet.

**2. Create `src/lib/rnnoise-processor.ts` — AudioWorklet-based noise suppression**
- Load the RNNoise WASM module
- Create an AudioWorklet processor that takes raw PCM audio frames, runs them through RNNoise, and outputs clean audio
- Expose a simple API: `createDenoisedTrack(originalTrack: MediaStreamTrack): Promise<MediaStreamTrack>` that returns a new processed track

**3. Create `src/hooks/useNoiseCancellation.ts` — State management hook**
- Manages the on/off state of noise cancellation
- Handles creating/destroying the denoised track pipeline
- Provides `toggleNoiseCancellation()` and `isNoiseCancellationOn` state

**4. Modify `src/hooks/useLiveKit.ts` — Integrate noise cancellation into the audio pipeline**
- After enabling the microphone (`setMicrophoneEnabled(true)`), intercept the published audio track
- When noise cancellation is enabled, replace the raw audio track with the denoised version using `localParticipant.publishTrack()` 
- Add `noiseCancellation` to the state and expose `toggleNoiseCancellation`
- Persist the user's preference in localStorage

**5. Modify `src/pages/messenger/videocall/CallControls.tsx` — Add NC toggle button**
- Add a noise cancellation toggle button in the controls bar (near the mic button)
- Show active/inactive state with appropriate icon

**6. Modify `src/pages/messenger/videocall/PreJoinLobby.tsx` — Add NC toggle in pre-join**
- Add noise cancellation toggle in the pre-join settings so users can enable it before joining
- Persist preference across sessions

### Files to create
- `src/lib/rnnoise-processor.ts` — RNNoise WASM wrapper + AudioWorklet processor
- `src/hooks/useNoiseCancellation.ts` — React hook for NC state management
- `public/worklets/rnnoise-worklet.js` — AudioWorklet processor script

### Files to modify
- `package.json` — Add `@jitsi/rnnoise-wasm` dependency
- `src/hooks/useLiveKit.ts` — Integrate NC into audio pipeline, add toggle, persist state
- `src/pages/messenger/videocall/CallControls.tsx` — Add NC toggle button
- `src/pages/messenger/videocall/PreJoinLobby.tsx` — Add NC toggle in pre-join settings

### Technical Notes
- RNNoise processes 480-sample frames at 48kHz (10ms), matching the `sampleRate: 48000` already configured
- The AudioWorklet approach keeps processing off the main thread
- When NC is off, the original track passes through unmodified (zero overhead)
- Browser `noiseSuppression` will be kept as a fallback layer

