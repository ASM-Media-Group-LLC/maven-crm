

## Plan: Unificar el preview A4 de creación con el componente compartido

### Problema
El A4 en la página de creación (`NuevoInvoicePage.tsx`, líneas 297-410) tiene el layout de billing + invoice details **lado a lado** (`flex justify-between`), mientras que `InvoiceA4Preview.tsx` los muestra **uno debajo del otro** (billing grid arriba, invoice details abajo a la izquierda). Son dos renders diferentes del mismo documento.

### Solución
Reemplazar el bloque inline A4 (líneas 297-410) por el componente `InvoiceA4Preview`, pasándole los datos del formulario como props. Mantener el wrapper de zoom externo y los botones +/−.

### Cambio en `NuevoInvoicePage.tsx`
1. Importar `InvoiceA4Preview`
2. Reemplazar líneas 297-410 por:
```tsx
<InvoiceA4Preview
  invoice={{
    amount: grandTotal,
    agency_amount: agencyTotal,
    blue_amount: blueTotal,
    paypal_amount: paypalAmount,
    due_date: dueDate,
    notes,
    created_at: new Date().toISOString(),
    creators: selectedCreator ? {
      id: selectedCreator.id,
      name: selectedCreator.name,
      artistic_name: selectedCreator.artistic_name,
      phone: selectedCreator.phone,
      creator_business: selectedCreator.creator_business,
    } : undefined,
  }}
  template={selectedTemplate}
/>
```
3. Eliminar las constantes `A4_W` y `A4_H` locales (ya están en el componente), pero **mantener** el zoom wrapper y los botones +/− ya que el componente usa zoom fijo de 0.82, y aquí queremos zoom interactivo.

**Ajuste necesario en `InvoiceA4Preview.tsx`**: Hacer que el `ZOOM` sea configurable via prop opcional (`zoom?: number`) para que la página de creación pueda pasar su zoom interactivo, defaulteando a 0.82.

| Archivo | Cambio |
|---------|--------|
| `InvoiceA4Preview.tsx` | Agregar prop opcional `zoom` (default 0.82) |
| `NuevoInvoicePage.tsx` | Reemplazar inline A4 por `<InvoiceA4Preview zoom={zoom} .../>`, eliminar código duplicado |

