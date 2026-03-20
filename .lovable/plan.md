

## Plan: Custom Background Upload Support

### Problem
Users can only choose from 8 preset backgrounds or blur. There's no way to upload a personal image as a virtual background.

### Approach
Use a `custom:<objectURL>` convention for the `BackgroundEffect` type. The image is loaded client-side only (no server upload needed) — the object URL lives for the session duration, which matches the "no persistence" policy already in place.

### Changes

**1. `src/pages/messenger/videocall/BackgroundSelector.tsx`**
- Add a hidden `<input type="file" accept="image/*">` and an "Upload" button tile in the effects row (Plus icon)
- On file select: create `URL.createObjectURL(file)`, store it in local state as `customBgs: { id, src, objectUrl }[]`
- Call `onSelect("custom:<objectUrl>")` when a custom background is chosen
- Show custom backgrounds in a "Tus fondos" section above templates, with a delete (X) button on hover that revokes the object URL
- Add helper: `isCustomBackground(effect)` → checks `effect.startsWith("custom:")`
- Update `isTemplateBackground()` to exclude custom backgrounds
- Export `isCustomBackground` and `getCustomBackgroundUrl` (strips `custom:` prefix)

**2. `src/pages/messenger/videocall/VideoSettingsDialog.tsx`**
- Mirror the same custom upload UI: file input + upload button + custom backgrounds grid
- Use same `custom:<url>` convention when calling `onBackgroundChange`

**3. `src/hooks/useLiveKit.ts`** (~line 563)
- In the background apply function, add an `else if (isCustomBackground(effect))` branch before the final `else`
- Extract URL via `getCustomBackgroundUrl(effect)`, preload the image, then call `processor.switchTo({ mode: "virtual-background", imagePath: url })`

**4. `src/pages/messenger/videocall/PreJoinLobby.tsx`** (~line 196)
- Same change: add `isCustomBackground` handling in `applyBackgroundToTrack`
- Extract URL and pass to `processor.switchTo({ mode: "virtual-background", imagePath: url })`
- Update `preloadTemplate` to also handle custom URLs

**5. `src/test/videocall/BackgroundSelector.test.tsx`**
- Add test for `isCustomBackground` helper
- Verify custom backgrounds don't interfere with template validation

### Files Modified
- `src/pages/messenger/videocall/BackgroundSelector.tsx` — upload UI + helpers
- `src/pages/messenger/videocall/VideoSettingsDialog.tsx` — upload UI
- `src/hooks/useLiveKit.ts` — custom background processor branch
- `src/pages/messenger/videocall/PreJoinLobby.tsx` — custom background processor branch
- `src/test/videocall/BackgroundSelector.test.tsx` — tests

