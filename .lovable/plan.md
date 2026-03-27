

## Plan: Agregar acción "Ver" en la tabla de Notas de Pago

### Resumen
Crear un componente `PaymentNoteA4Preview` (similar a `InvoiceA4Preview`) y agregar un botón "Ver" antes del botón "Eliminar" en la tabla de Notas de Pago. Al hacer clic, se abre el mismo tipo de modal transparente centrado que ya se usa para invoices.

### Cambios

**1. Crear `src/pages/finanzas/facturacion/PaymentNoteA4Preview.tsx`**

Componente A4 de solo lectura que recibe los datos de una nota de pago (`amount`, `payment_type`, `payment_method`, `due_date`, `notes`, `created_at`, `_creator`). Replica la estructura visual de la vista previa de `NuevaNotaPagoPage` (título "Nota de Pago", sección "Pay to", tabla con concepto/descripción/monto, footer KASH AGENCY) con zoom fijo `0.82` igual que `InvoiceA4Preview`.

**2. Modificar `src/pages/finanzas/facturacion/FacturacionPage.tsx`**

- Importar `PaymentNoteA4Preview`.
- Añadir estado `viewNoteItem` separado para notas de pago (o reutilizar `viewItem` con un flag `_isPaymentNote`).
- En la tabla de Notas de Pago (línea ~405-407), agregar un botón `Eye` **antes** del botón `Trash2`:
  ```tsx
  <Tooltip><TooltipTrigger asChild>
    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewNoteItem(n)}>
      <Eye className="h-3.5 w-3.5" />
    </Button>
  </TooltipTrigger><TooltipContent side="left">Ver</TooltipContent></Tooltip>
  ```
- Agregar un segundo `Dialog` al final del archivo para la vista de nota de pago, con el mismo estilo del modal de invoices:
  ```tsx
  <Dialog open={!!viewNoteItem} onOpenChange={() => setViewNoteItem(null)}>
    <DialogContent className="max-w-fit bg-transparent border-none shadow-none p-0 [&>button:last-child]:hidden">
      {viewNoteItem && <PaymentNoteA4Preview note={viewNoteItem} />}
    </DialogContent>
  </Dialog>
  ```

### Archivos
- **Crear**: `src/pages/finanzas/facturacion/PaymentNoteA4Preview.tsx`
- **Modificar**: `src/pages/finanzas/facturacion/FacturacionPage.tsx`

