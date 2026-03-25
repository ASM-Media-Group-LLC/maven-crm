

## Problem

The `contain: "size layout"` on the content wrapper (line 98) is the root cause. CSS size containment makes the element's intrinsic size independent of its children, which can cause it to collapse or miscalculate height within a flex container. Combined with previous attempts, the layout chain is fragile.

## Fix — Complete rewrite of the modal's layout structure

Replace the current content area with a bulletproof flex layout chain where every intermediate container has `min-h-0` (to allow flex shrinking below content size) and `overflow-hidden` (to trap content), with only the leaf scroll containers using `overflow-auto`.

### Changes in `CrearInvoiceModal.tsx`

**Line 91** — DialogContent: keep `flex flex-col max-h-[85vh] overflow-hidden` but remove `gap-0` noise.

**Line 98** — Content wrapper: Remove `contain: "size layout"` style. Use only `flex-1 min-h-0 overflow-hidden` (no padding here — move padding to children to avoid height miscalculation).

**Line 99** — Grid: Use `grid grid-cols-[400px_1fr] gap-6 h-full` with no extra constraints. The parent's `overflow-hidden` + `min-h-0` already bounds it.

**Line 101** — Left column (form): `overflow-y-auto min-h-0 pr-1 py-6 pl-6` — scrollable, with padding moved here.

**Line 159** — Right column wrapper: `min-h-0 overflow-hidden py-6 pr-6` — padding moved here.

**Line 179** — A4 viewer scroll area: keep `flex-1 min-h-0 overflow-auto`.

**Line 180** — Inner A4 wrapper: Remove `minHeight`/`minWidth` style entirely. The scroll container handles overflow naturally. Just use `flex justify-center items-start p-4`.

This removes all hacks (`contain`, `minHeight`, `grid-rows-[1fr]`) and uses a clean flex+grid chain where height flows from `max-h-[85vh]` → header(shrink-0) → content(flex-1 min-h-0 overflow-hidden) → grid(h-full) → columns(min-h-0 overflow-auto/hidden) → footer(shrink-0).

