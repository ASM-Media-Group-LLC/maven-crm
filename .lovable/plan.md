

## Fix: Fecha de vencimiento inconsistente entre tabla e Invoice A4

### Problema
En `FacturacionPage.tsx` línea 285, la fecha se parsea como `new Date(inv.due_date)` sin el sufijo `T12:00:00`, lo que causa que la zona horaria del navegador desplace la fecha un día atrás. El A4 sí usa `T12:00:00` correctamente.

### Solución
**Archivo**: `src/pages/finanzas/facturacion/FacturacionPage.tsx`

Cambiar las dos ocurrencias de `due_date` en la sección de invoices:

- **Línea 285** (tabla desktop):
  `format(new Date(inv.due_date), "dd/MM/yyyy")` → `format(new Date(inv.due_date + "T12:00:00"), "dd/MM/yyyy")`

- **Línea 360** (vista móvil):
  `format(new Date(inv.due_date), "dd/MM/yyyy")` → `format(new Date(inv.due_date + "T12:00:00"), "dd/MM/yyyy")`

Esto alinea el parsing con el mismo método usado en `InvoiceA4Preview.tsx` y `PaymentNoteA4Preview.tsx`.

