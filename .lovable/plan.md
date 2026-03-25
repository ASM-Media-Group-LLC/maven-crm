

## Problem

The CSS grid on line 99 uses `h-full min-h-0` but grid rows default to `auto` height, meaning the right column's content can push the grid taller than the available space, causing it to overflow behind the footer.

## Fix — `CrearInvoiceModal.tsx`

One targeted change: add `grid-rows-[1fr]` to the grid container (line 99) so the single row is strictly bounded to the container height, preventing content from pushing past.

```
// Line 99 — change:
<div className="grid grid-cols-[400px_1fr] gap-6 h-full min-h-0">

// To:
<div className="grid grid-cols-[400px_1fr] grid-rows-[1fr] gap-6 h-full min-h-0 overflow-hidden">
```

This forces the grid row to respect the parent's height constraint. Combined with the existing `min-h-0 overflow-hidden` on the right column (line 159), the preview will scroll internally instead of pushing the layout.

