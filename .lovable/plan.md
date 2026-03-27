

## Plan: Corregir visibilidad del botón X en el modal de factura

### Diagnóstico
El `DialogContent` actualmente tiene clases que lo expanden a pantalla completa (`fixed inset-0 w-full h-full`), cambiando su comportamiento por defecto. El usuario quiere que `DialogContent` sea solo el contenedor del contenido (comportamiento por defecto de Radix), y que el botón X se posicione dentro de este con `absolute`.

El selector `[&>button:last-child]:hidden` debería ocultar solo el botón Radix por defecto (que siempre es el último hijo en el DOM de `dialog.tsx`), pero al cambiar el layout a pantalla completa se crearon complicaciones innecesarias.

### Cambio

**Archivo: `src/pages/finanzas/facturacion/FacturacionPage.tsx` (líneas 603-615)**

Revertir `DialogContent` a su tamaño por defecto (envuelve el contenido) y posicionar el botón X dentro:

```tsx
<Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
  <DialogContent
    className="relative max-w-fit bg-transparent border-none shadow-none p-0 [&>button:last-child]:hidden"
  >
    <button
      onClick={() => setViewItem(null)}
      className="absolute -top-4 -right-4 z-[60] bg-black/60 rounded-full p-1.5 text-white/90 hover:text-white hover:bg-black/80 transition-colors cursor-pointer"
    >
      <X className="h-4 w-4" />
    </button>
    {viewItem && <InvoiceA4Preview invoice={viewItem as any} />}
  </DialogContent>
</Dialog>
```

### Detalles
- **`relative`**: Crea contexto de posicionamiento para el botón `absolute` dentro del content box
- **Se eliminan** las sobreescrituras de layout (`fixed inset-0`, `flex`, `translate-x-0`, etc.) — el DialogContent vuelve a su comportamiento por defecto (centrado con transform, tamaño ajustado al contenido)
- **`max-w-fit`**: El content box se ajusta al tamaño del A4
- **`absolute -top-4 -right-4`**: El botón se posiciona en la esquina superior derecha del content box, ligeramente fuera para no tapar contenido
- **`bg-black/60 rounded-full`**: Fondo semitransparente para contraste sobre el overlay oscuro
- **`z-[60]`**: Siempre visible por encima del contenido
- **`[&>button:last-child]:hidden`**: Solo oculta el botón close por defecto de Radix (último hijo en el DOM)
- Las animaciones por defecto del DialogContent se **preservan** intactas

Un solo archivo modificado.

