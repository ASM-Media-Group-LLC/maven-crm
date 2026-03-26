

## Plan: Modal A4 simple sin fondo ni controles

### Cambio
Reemplazar el Dialog de texto (líneas 497-514 de `FacturacionPage.tsx`) por un modal limpio que solo muestre el documento A4 centrado, sin fondo gris, sin controles de zoom, sin header de "Vista previa".

### Implementación en `FacturacionPage.tsx`

Reemplazar el `<Dialog>` actual por uno con:
- `max-w-fit` y fondo transparente (`bg-transparent shadow-none border-none`)
- Sin `DialogHeader` / `DialogTitle`
- Solo el div A4 (595x842) con el template del invoice idéntico al de `CrearInvoiceModal.tsx`
- Zoom fijo (ej. 0.85) para que quepa en el viewport sin scroll
- El A4 se centra automáticamente por el layout del `DialogContent`

### Archivos

| Archivo | Acción |
|---------|--------|
| `InvoiceA4Preview.tsx` | **Crear** — componente puro que recibe datos del invoice y renderiza el A4 (extraído del template en `CrearInvoiceModal`) |
| `FacturacionPage.tsx` | **Editar** — reemplazar Dialog líneas 497-514 por modal limpio con `InvoiceA4Preview` |

### Detalle del componente `InvoiceA4Preview`

Props: `{ invoice: { invoice_number, amount, fee_type, fee_amount, net_amount, payment_method, due_date, notes, status, creators?: { name, artistic_name } }, createdAt?: string }`

Renderiza exactamente el mismo template A4 del `CrearInvoiceModal`: logo KASH, header corporativo, Bill to, tabla de servicios, fee, neto, notas, footer. Solo lectura, sin formulario.

### Detalle del modal en `FacturacionPage`

```tsx
<Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
  <DialogContent className="max-w-fit bg-transparent border-none shadow-none p-0">
    <InvoiceA4Preview invoice={viewItem} />
  </DialogContent>
</Dialog>
```

El A4 se renderiza a escala fija (0.85) directamente centrado en el overlay del dialog.

