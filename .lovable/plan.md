

## Plan: Remove User Preferences Persistence & Default Mic/Camera Off

### What changes

Remove localStorage persistence for pre-join settings (mic, cam, background, devices) and view settings (layout). Always default to mic OFF, camera OFF, background "none".

### Changes

**1. `src/pages/messenger/videocall/PreJoinLobby.tsx`**
- Remove constants: `PREJOIN_STORAGE_KEY_PREFIX`, `PREJOIN_GLOBAL_STORAGE_KEY`
- Remove types: `PersistedPreJoinSettings`
- Remove functions: `getPreJoinStorageKey`, `parsePreJoinSettings`, `loadPreJoinSettings`, `savePreJoinSettings`
- Remove `initialSettingsRef` — replace all usages with hardcoded defaults
- Change defaults: `micOn: false`, `camOn: false`, `backgroundEffect: "none"`, device IDs: `""`
- Remove the `useEffect` that loads persisted settings on mount (~line 159-169)
- Remove the `useEffect` that auto-saves settings on change (~line 171-180)

**2. `src/pages/messenger/videocall/LiveKitCallView.tsx`**
- Remove `STORAGE_KEY` constant
- Remove `loadViewSettings` and `saveViewSettings` functions
- Initialize `viewSettings` with inline default: `{ layout: "auto", maxTiles: 49, hideNoVideo: false }`
- Update `handleViewSettingsChange` to just `setViewSettings(s)` without saving

**3. `src/test/videocall/PreJoinLobby.test.tsx`**
- Remove `roomStorageKey` and `globalStorageKey` constants
- Remove `localStorage.clear()` from `beforeEach`
- Remove 3 tests that reference localStorage ("loads mic/cam presets from global storage", "prioritizes room-specific presets", and any others)
- Update tests that expect mic/cam ON by default — they now start OFF

### Files Modified
- `src/pages/messenger/videocall/PreJoinLobby.tsx`
- `src/pages/messenger/videocall/LiveKitCallView.tsx`
- `src/test/videocall/PreJoinLobby.test.tsx`

