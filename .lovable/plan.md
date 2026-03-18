

## Plan: Make Hub Pop-up Controls Responsive

### Problem

The `CallControls` and `CallTopBar` components use fixed sizes designed for full-screen calls (h-11 buttons, gap-2, device popovers, reactions, etc.). Inside the 480px pop-up, these overflow and clip.

### Solution

Add a `compact` prop to `LiveKitCallView`, `CallControls`, and `CallTopBar`. When `compact` is true, controls shrink to fit the pop-up.

### Changes

#### 1. `LiveKitCallView.tsx`
- Add `compact?: boolean` to props interface.
- Pass `compact` down to `CallTopBar` and `CallControls`.

#### 2. `CallTopBar.tsx`
- Add `compact?: boolean` prop.
- When compact: reduce padding (`px-2 py-1`), smaller text, hide the timer and share-link button, keep only room name and participant count.

#### 3. `CallControls.tsx`
- Add `compact?: boolean` prop.
- When compact:
  - Shrink buttons from `h-11 w-11` to `h-8 w-8`, icons from `h-[18px]` to `h-3.5`.
  - Reduce gap from `gap-2` to `gap-1`.
  - Hide non-essential controls: reactions, hand raise, screen share, device popovers (chevron buttons), metrics/participants/chat panel toggles.
  - Keep only: mic toggle, cam toggle, and leave button (smaller pill).
  - Reduce overall padding.

#### 4. `CoworkHostDashboard.tsx`
- Pass `compact` to the Hub's `LiveKitCallView` instance (line 449).

### Files Modified
- `src/pages/messenger/videocall/CallTopBar.tsx`
- `src/pages/messenger/videocall/CallControls.tsx`
- `src/pages/messenger/videocall/LiveKitCallView.tsx`
- `src/pages/cowork/CoworkHostDashboard.tsx`

