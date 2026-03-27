

## Plan: Fix close button in invoice preview modal

### Problem
The close button is placed as a sibling of `DialogContent` inside `Dialog`. Since `DialogContent` renders through a Portal (with its own overlay at z-50), the button stays in the regular DOM flow and gets covered by the overlay, making it unclickable.

### Solution
Move the button **inside** `DialogContent` so it gets portaled along with the modal content, but keep `fixed top-5 right-5` positioning so it visually stays anchored to the overlay corner.

### Change

**File: `src/pages/finanzas/facturacion/FacturacionPage.tsx` (lines 603-615)**

```tsx
<Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
  <DialogContent className="max-w-fit bg-transparent border-none shadow-none p-0 [&>button]:hidden">
    <button
      onClick={() => setViewItem(null)}
      className="fixed top-5 right-5 z-[60] text-white/80 hover:text-white transition-colors cursor-pointer"
    >
      <X className="h-5 w-5" />
    </button>
    {viewItem && <InvoiceA4Preview invoice={viewItem as any} />}
  </DialogContent>
</Dialog>
```

The button moves inside the portal (so it's above the overlay) while keeping its fixed position in the viewport corner. The `[&>button]:hidden` selector only hides the default Radix close button (which is a `DialogPrimitive.Close`), not our custom `<button>`.

