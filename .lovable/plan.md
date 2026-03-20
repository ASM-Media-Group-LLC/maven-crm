

## Plan: Fix Low Audio Levels in Video Calls

### Root Cause

Two factors combine to produce noticeably lower audio compared to Google Meet:

1. **Noise gate attenuation is too aggressive**: The custom AudioWorklet noise gate (`noise-suppression-worklet.js`) uses a `_gateRatio` of 3.0 (signal must be 3x above noise floor) and attenuates to a minimum gain of 0.008 (~-42dB). Soft-spoken users or users with quiet microphones get partially gated — their speech signal barely clears the threshold, so the gain hovers well below 1.0. Google Meet uses ML-based suppression that preserves full speech volume.

2. **No output gain normalization**: Google Meet applies automatic gain control on the *receiving* side to normalize remote audio levels. The current implementation sets `audioEl.volume = 1` (no boost) and relies entirely on the browser's AGC on the *capture* side, which doesn't help if the sender's audio is already attenuated by the noise gate.

### Solution

**A. Tune the noise gate to be less aggressive** (`noise-suppression-worklet.js`)
- Lower `_gateRatio` from 3.0 → 2.0 (voice only needs to be 2x above noise floor)
- Raise minimum gain floor from 0.008 → 0.02 (~-34dB — still suppresses noise but doesn't crush quiet speech)
- Shorten release time from 60ms → 40ms (faster recovery preserves natural speech dynamics)
- Extend hold time from 150ms → 200ms (prevents gate from closing during natural pauses within sentences)

**B. Add a subtle output gain boost for remote audio** (`ParticipantTile.tsx`)
- After attaching the remote audio track, use Web Audio API to insert a GainNode between the MediaStream and the `<audio>` element
- Apply a modest 1.4x (~3dB) gain boost — enough to match Google Meet levels without clipping
- Create and reuse an AudioContext per tile; clean up on unmount

### Changes

**1. `public/worklets/noise-suppression-worklet.js`**
- `_gateRatio`: 3.0 → 2.0
- `_holdSamples`: 0.15 → 0.20 seconds
- `_releaseCoeff`: 0.06 → 0.04 seconds
- Minimum gain: 0.008 → 0.02

**2. `src/pages/messenger/videocall/ParticipantTile.tsx`**
- In `attachAudioTrack`, after `audioTrack.track.attach(audioEl)`, create a Web Audio gain pipeline:
  - `AudioContext` → `createMediaStreamSource(audioEl.srcObject)` → `GainNode(gain: 1.4)` → `createMediaStreamDestination()` → reassign `audioEl.srcObject`
- Store refs to AudioContext and GainNode for cleanup on detach/unmount
- Clean up the AudioContext in the unmount effect

### Technical Detail

```text
Remote Track → <audio>.srcObject (MediaStream)
                    ↓
          AudioContext.createMediaStreamSource
                    ↓
             GainNode (gain = 1.4)
                    ↓
          createMediaStreamDestination
                    ↓
          <audio>.srcObject = boosted stream
```

### Files Modified
- `public/worklets/noise-suppression-worklet.js` — tune gate parameters
- `src/pages/messenger/videocall/ParticipantTile.tsx` — add output gain boost

