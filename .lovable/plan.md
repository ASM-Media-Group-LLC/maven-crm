

## Plan: Modal de creación de Invoice con Template + Comisión

### Resumen

Reemplazar la navegación a `/finanzas/facturacion/facturas/nueva` por un modal que se abre desde la vista de Invoices. El modal tiene un flujo simplificado: seleccionar template, seleccionar comisión(es), y confirmar. El invoice se genera combinando datos del template con los cálculos de la comisión.

### Cambios

| Archivo | Cambio |
|---------|--------|
| `CrearInvoiceModal.tsx` | Reescribir completamente: eliminar el formulario actual (monto manual, fee, preview A4). Nuevo flujo con 3 pasos: 1) Seleccionar Template (obligatorio), 2) Seleccionar Creador + Comisión(es), 3) Confirmar. Sin preview A4 en el modal para mantenerlo ligero. |
| `FacturacionPage.tsx` | Reemplazar `navigate("/finanzas/facturacion/facturas/nueva")` por apertura del modal (`setCrearOpen(true)`). Agregar state `crearOpen`, renderizar `<CrearInvoiceModal>` y pasar `createInvoice.mutate` como callback. |
| **DB Migration** | Agregar columna `template_id` (uuid, nullable, FK a `invoice_templates`) a la tabla `invoices` para persistir qué template se usó. |

### Detalle del nuevo `CrearInvoiceModal`

**Props:** `open`, `onClose`, `onSubmit`, `isPending`

**Estado interno:**
- `selectedTemplateId` - template seleccionado (obligatorio)
- `creatorId` - creador seleccionado
- `selectedCommissionIds` - comisiones seleccionadas (checkboxes)
- `dueDate`, `notes` - campos opcionales

**Flujo:**
1. El usuario selecciona un template de la lista (Select con templates tipo "invoice")
2. Selecciona un creador (Combobox existente)
3. Al seleccionar creador, se cargan automáticamente sus comisiones disponibles (sin filtro de fecha, mostrando las que no tienen invoice asociado o todas)
4. El usuario marca las comisiones que desea incluir
5. Se calculan automáticamente los totales (agency, blue, paypal) de las comisiones seleccionadas
6. Se muestra un resumen con el total
7. Al confirmar, el payload incluye `template_id` y los montos calculados

**Payload al crear:**
```ts
{
  creator_id, template_id,
  amount: grandTotal,
  agency_amount, blue_amount, paypal_amount,
  net_amount: grandTotal,
  due_date, notes,
  status: "borrador",
  period_start: min(comisiones.period_start),
  period_end: max(comisiones.period_end),
}
```

### Cambio en `FacturacionPage.tsx`

- Línea 556: Cambiar `navigate("/finanzas/facturacion/facturas/nueva")` por `setCrearOpen(true)`
- Agregar state `const [crearOpen, setCrearOpen] = useState(false)`
- Renderizar el modal:
```tsx
<CrearInvoiceModal
  open={crearOpen}
  onClose={() => setCrearOpen(false)}
  onSubmit={(data) => { createInvoice.mutate(data); setCrearOpen(false); }}
  isPending={createInvoice.isPending}
/>
```

### Cambio en visualización (InvoiceA4Preview)

Al visualizar un invoice existente que tiene `template_id`, se necesita cargar el template correspondiente. Esto requiere:
- En `FacturacionPage.tsx`, al hacer fetch de invoices, incluir los datos del template en el join: `invoices.select("*, creators(...), invoice_templates(...)"`
- Pasar `template` al `InvoiceA4Preview` cuando se visualiza un invoice existente

### Migración de base de datos

```sql
ALTER TABLE public.invoices 
ADD COLUMN template_id uuid REFERENCES public.invoice_templates(id) ON DELETE SET NULL;
```

