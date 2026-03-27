

## Plan: Mover botón X al overlay

**Archivo: `src/pages/finanzas/facturacion/FacturacionPage.tsx` (líneas 603-615)**

Sacar el botón X fuera del `DialogContent` y posicionarlo fijo dentro del `Dialog` overlay, usando `fixed top-5 right-5`:

```tsx
<Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
  <DialogContent className="max-w-fit bg-transparent border-none shadow-none p-0 [&>button]:hidden">
    {viewItem && <InvoiceA4Preview invoice={viewItem as any} />}
  </DialogContent>
  {viewItem && (
    <button
      onClick={() => setViewItem(null)}
      className="fixed top-5 right-5 z-[60] text-white/80 hover:text-white transition-colors"
    >
      <X className="h-5 w-5" />
    </button>
  )}
</Dialog>
```

El botón queda anclado a la esquina superior derecha de la ventana (overlay), con ~20px de margen, siempre visible independientemente del tamaño del documento A4.

