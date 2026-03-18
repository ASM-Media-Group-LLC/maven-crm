

## Plan: Add Maximize Button to Host Hub Pop-up

### Change

In `CoworkHostDashboard.tsx`:

1. Add a `hubMaximized` state (`useState(false)`).
2. Add a maximize/restore button (using `Maximize2`/`Minimize2` icons from lucide-react) between the minimize and close buttons in the pop-up header (line 429).
3. When maximized, change the pop-up container classes from fixed-size (`w-96 md:w-[480px]`, `height: 380px`) to near-fullscreen (`w-[calc(100vw-2rem)] h-[calc(100vh-2rem)]`), and pass `compact={false}` to `LiveKitCallView` so controls render at full size.
4. When restored, revert to the current compact dimensions and `compact={true}`.

### Files Modified
- `src/pages/cowork/CoworkHostDashboard.tsx` — Add state, maximize button, and conditional sizing.

