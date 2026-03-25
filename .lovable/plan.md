

## Problem

The A4 preview element (595×842px) is scaled via CSS `transform: scale(zoom)` but `transform` doesn't affect layout flow — the element still occupies its full 595×842px in the document flow regardless of zoom. This causes the scroll container to be larger than necessary and can push content beyond the visible area.

## Fix

Wrap the A4 element in a container whose `width` and `height` are explicitly set to the **scaled** dimensions (`A4_W * zoom` × `A4_H * zoom`). This makes the layout-flow size match the visual size, so the scroll container only grows as much as the actual visible preview needs.

### Changes in `CrearInvoiceModal.tsx`

**Line 180-183** — Replace the current inner wrapper with a sized container:

```tsx
{/* Current */}
<div className="flex justify-center items-start p-4">
  <div
    style={{ width: A4_W, height: A4_H, transform: `scale(${zoom})`, transformOrigin: "top center" }}
    className="bg-white rounded shadow-2xl ..."
  >

{/* New */}
<div className="flex justify-center items-start p-4">
  <div style={{ width: A4_W * zoom, height: A4_H * zoom }} className="shrink-0">
    <div
      style={{ width: A4_W, height: A4_H, transform: `scale(${zoom})`, transformOrigin: "top left" }}
      className="bg-white rounded shadow-2xl ..."
    >
```

This adds a wrapper div whose dimensions match the scaled output, containing the transform within a properly-sized box. The `transformOrigin` changes to `top left` to align with the wrapper's top-left corner. The outer flex container centers this wrapper naturally.

Single file change, minimal diff.

