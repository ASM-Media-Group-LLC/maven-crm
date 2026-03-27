

## Plan: Botón X con posición absoluta relativo al overlay

### Problema actual
1. `[&>button]:hidden` oculta TODOS los `<button>` hijos directos, incluyendo nuestro botón custom
2. `DialogContent` usa `fixed left-[50%] top-[50%] translate(-50%)` con tamaño ajustado al contenido — `absolute` dentro de él se posiciona relativo al A4, no al overlay

### Solución
Hacer que `DialogContent` ocupe todo el viewport (como el overlay) y centrar el A4 con flexbox. Así `absolute top-5 right-5` se posiciona en la esquina del overlay.

**Archivo: `src/pages/finanzas/facturacion/FacturacionPage.tsx` (líneas 603-613)**

```tsx
<Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
  <DialogContent
    className="fixed inset-0 left-0 top-0 z-50 flex items-center justify-center
               max-w-none w-full h-full translate-x-0 translate-y-0
               bg-transparent border-none shadow-none p-0
               [&>button:last-child]:hidden"
  >
    <button
      onClick={() => setViewItem(null)}
      className="absolute top-5 right-5 z-[60] text-white/80 hover:text-white
                 transition-colors cursor-pointer"
    >
      <X className="h-5 w-5" />
    </button>
    {viewItem && <InvoiceA4Preview invoice={viewItem as any} />}
  </DialogContent>
</Dialog>
```

### Cambios clave
- **`fixed inset-0 left-0 top-0 w-full h-full translate-x-0 translate-y-0 max-w-none`**: Sobreescribe el posicionamiento centrado por defecto, haciendo que DialogContent cubra todo el viewport (como el overlay)
- **`flex items-center justify-center`**: Centra el A4 visualmente dentro del contenedor
- **`absolute top-5 right-5`**: Posiciona el X relativo al contenedor (que ahora es todo el overlay), no al viewport
- **`[&>button:last-child]:hidden`** en vez de `[&>button]:hidden`: Solo oculta el botón close por defecto de Radix (que se renderiza siempre como último hijo), dejando visible nuestro botón custom

Un solo archivo modificado: `FacturacionPage.tsx`

