

## Plan: Preserve All Controls in Compact Mode

### Problem

The current `compact` mode in `CallControls.tsx` hides 5 controls entirely:
- Screen share (line 289: `!compact && !hideScreenShare`)
- Reactions (line 299: `!compact`)
- Hand raise (line 318: `!compact`)
- Right panel toggles: Metrics, Participants, Chat (line 335: `!compact`)

The user wants all controls visible, just scaled down to fit the pop-up.

### Changes

#### `CallControls.tsx`

1. **Remove all `!compact &&` guards** on screen share, reactions, hand raise, and right panel toggles -- so they always render.

2. **Make `ControlBtn` and `PanelBtn` size-aware**: Accept a `compact` prop and use smaller sizes (`h-8 w-8` / `h-3.5 w-3.5` icons for ControlBtn, `h-7 w-7` / `h-3.5 w-3.5` for PanelBtn) when compact.

3. **Compact mic/cam**: Keep the simplified (no device popover chevron) versions for compact, but use the same smaller sizing already in place.

4. **Reactions popover**: Render in compact with smaller emoji buttons.

5. **Right panel toggles**: Render in compact mode but inside the same centered row (no flex-1 spacer), keeping everything in a single centered line of controls.

6. **Layout adjustment**: In compact mode, use `flex-wrap justify-center gap-1` so controls wrap naturally within the 480px pop-up width if needed.

#### `CallTopBar.tsx`

No changes needed -- current compact behavior (hiding timer/share link) is appropriate for the top bar.

### Result

All 8+ controls (mic, cam, screen share, reactions, hand raise, leave, metrics, participants, chat) remain visible in compact mode, just smaller. The pop-up at 480px wide can fit ~10 small buttons in a row comfortably.

