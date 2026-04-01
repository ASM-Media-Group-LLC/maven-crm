

## Auto-calcular fecha de vencimiento en Invoices

### Lógica
La fecha de vencimiento (`due_date`) se calculará automáticamente como **period_end + 5 días** (la fecha final más tardía entre las comisiones seleccionadas). Se elimina el campo manual de fecha.

### Cambios

**1. `src/pages/finanzas/facturacion/CrearInvoiceModal.tsx`**
- Eliminar el estado `dueDate` y su input manual
- En `totals` (useMemo), calcular `dueDate` como `periodEnd + 5 días`
- Pasar ese valor calculado en `handleSubmit` → `due_date`
- Mostrar la fecha calculada en el resumen de comisiones seleccionadas
- Ajustar el grid de "Notas" para ocupar ancho completo (ya no comparte fila con fecha)

**2. `src/pages/finanzas/facturacion/InvoiceA4Preview.tsx`**
- Eliminar la condición `{invoice.due_date && ...}` para que **siempre** muestre el campo "Due date" (con fallback "—" si no existe)

### Sin cambios necesarios
- La tabla en `FacturacionPage.tsx` ya muestra `due_date` correctamente desde la BD
- El campo `due_date` en la BD se sigue persistiendo igual, solo cambia el origen del valor

