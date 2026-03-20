

## Plan: Remove "Destacado" (Spotlight) Layout Option

### What changes

Remove the "Destacado" layout mode from the Adjust View dialog and all related code. The remaining layout options will be: Auto, Mosaico, and Barra lateral. Pinned participants and screen sharing will use the "sidebar" layout instead of "spotlight".

### Changes

**1. `src/pages/messenger/videocall/AdjustViewDialog.tsx`**
- Remove `"spotlight"` from the `LayoutMode` type: `"auto" | "tiled" | "sidebar"`
- Remove the spotlight entry from `LAYOUT_OPTIONS` array (the one with `Presentation` icon)
- Remove the `Presentation` import from lucide-react

**2. `src/pages/messenger/videocall/LiveKitCallView.tsx`**
- Update `effectiveLayout` type from `"grid" | "spotlight" | "sidebar"` to `"grid" | "sidebar"`
- In the `effectiveLayout` useMemo:
  - Pinned participant → return `"sidebar"` instead of `"spotlight"`
  - Remove `if (mode === "spotlight") return "spotlight"`
  - Screen sharing in auto mode → return `"sidebar"` instead of `"spotlight"`
- Remove the entire `else` branch (lines ~214-230) that rendered the spotlight overlay layout — the sidebar branch already handles the focus+thumbnails pattern
- Keep `spotlightParticipant` memo as-is (it's used by sidebar layout too)

**3. `src/pages/messenger/VideoCallView.tsx`**
- Remove the `layout` state and the spotlight/grid toggle button entirely (this is a demo component — it only had grid and spotlight, grid is sufficient)
- Remove the spotlight branch in the video grid (the `else` block rendering a flex column layout)
- Remove unused imports: `Grid3X3`, `LayoutGrid`

### Files Modified
- `src/pages/messenger/videocall/AdjustViewDialog.tsx`
- `src/pages/messenger/videocall/LiveKitCallView.tsx`
- `src/pages/messenger/VideoCallView.tsx`

