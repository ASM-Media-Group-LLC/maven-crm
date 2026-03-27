

## Plan: Quitar botón close y centrar A4 en el modal

### Problema
El modal tiene un botón X custom y clases `relative` innecesarias. El usuario quiere eliminar el botón y dejar solo el A4 centrado usando el comportamiento por defecto de `DialogContent`.

### Cambio

**Archivo: `src/pages/finanzas/facturacion/FacturacionPage.tsx` (líneas 603-615)**

Reemplazar el bloque actual por:

```tsx
<Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
  <DialogContent
    className="max-w-fit bg-transparent border-none shadow-none p-0 [&>button:last-child]:hidden"
  >
    {viewItem && <InvoiceA4Preview invoice={viewItem as any} />}
  </DialogContent>
</Dialog>
```

### Qué cambia
- Se elimina el `<button>` custom con el icono X (6 líneas)
- Se quita `relative` del className (ya no hay hijo absoluto)
- El centrado lo maneja `DialogContent` por defecto (`left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]` definidos en `dialog.tsx`)
- `max-w-fit` permite que el contenedor se ajuste al tamaño del A4
- `[&>button:last-child]:hidden` oculta el botón nativo de Radix
- El cierre funciona vía clic en overlay o tecla Escape

Un solo archivo, se eliminan líneas.

