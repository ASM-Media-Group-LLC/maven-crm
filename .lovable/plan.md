

## Plan: Botón X sin fondo ni borde en modal de vista previa

### Cambio

**Archivo: `src/pages/finanzas/facturacion/FacturacionPage.tsx` (líneas 603-607)**

Envolver el preview en un `div relative` y agregar un botón X minimalista (sin fondo, sin borde) en la esquina superior derecha:

```tsx
<Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
  <DialogContent className="max-w-fit bg-transparent border-none shadow-none p-0 [&>button]:hidden">
    <div className="relative">
      <button
        onClick={() => setViewItem(null)}
        className="absolute -top-3 -right-3 z-50 text-white/80 hover:text-white transition-colors"
      >
        <X className="h-5 w-5" />
      </button>
      {viewItem && <InvoiceA4Preview invoice={viewItem as any} />}
    </div>
  </DialogContent>
</Dialog>
```

Solo el icono X en blanco semitransparente sobre el fondo oscuro del overlay, sin círculo, sin fondo sólido, sin borde. `X` ya está importado de lucide-react.

