

## Plan: Sincronizar vista de Invoice con el preview de creación

### Problema
Al crear un invoice, el preview A4 muestra el desglose correcto (Agency Services, Blue, PayPal). Pero al visualizar un invoice ya creado, el componente `InvoiceA4Preview.tsx` usa la estructura antigua (amount + fee), mostrando datos inconsistentes.

### Solución
Persistir el desglose en la tabla `invoices` y actualizar el componente de visualización para reflejar exactamente la misma estructura del preview de creación.

---

### 1. Migración de base de datos — agregar columnas de desglose

Agregar 3 columnas a la tabla `invoices`:
- `agency_amount` (numeric, default 0) — monto de Agency Services
- `blue_amount` (numeric, default 0) — monto de Blue Package
- `paypal_amount` (numeric, default 0) — monto de PayPal fee

```sql
ALTER TABLE invoices
  ADD COLUMN agency_amount numeric DEFAULT 0,
  ADD COLUMN blue_amount numeric DEFAULT 0,
  ADD COLUMN paypal_amount numeric DEFAULT 0;
```

### 2. Actualizar `NuevoInvoicePage.tsx` — persistir desglose en submit

En el `handleSubmit`, incluir los campos nuevos en el payload:
```tsx
createInvoice.mutate({
  creator_id: creatorId,
  amount: grandTotal,
  agency_amount: agencyTotal,
  blue_amount: blueTotal,
  paypal_amount: paypalAmount,
  net_amount: grandTotal,
  due_date: dueDate || null,
  notes: notes || null,
  status: "borrador",
});
```

### 3. Reescribir `InvoiceA4Preview.tsx` — reflejar estructura del preview de creación

Actualizar el componente para usar los nuevos campos:
- Fila 1: "Agency Services" → `invoice.agency_amount`
- Fila 2 (condicional): "Blue" → `invoice.blue_amount` (si > 0)
- Fila 3 (condicional): "PayPal" → `invoice.paypal_amount` (si > 0)
- Total: `invoice.amount` (que es el grandTotal)
- Eliminar referencias a `fee_type`, `fee_amount` del viejo formato

### Archivos a modificar
- **Migración SQL**: nueva migración para agregar columnas
- **`src/pages/finanzas/facturacion/NuevoInvoicePage.tsx`**: ajustar payload del submit
- **`src/pages/finanzas/facturacion/InvoiceA4Preview.tsx`**: reescribir tabla con desglose

