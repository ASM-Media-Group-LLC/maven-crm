

## Modificaciones al cuerpo del A4

**Archivo**: `src/pages/finanzas/facturacion/CrearInvoiceModal.tsx`

### 1. Sección "Bill to" + "Invoice details" (líneas 198-206)

Reemplazar el separador y bloque "Facturar a" con dos columnas lado a lado:

- **Columna izquierda**: "Bill to" (label bold) + nombre del creador, "Address" (label bold, valor placeholder "—"), "Phone" (label bold, valor placeholder "—").
- **Columna derecha**: "Invoice details" (label bold), "Invoice no.:" + valor placeholder, "Invoice date:" + fecha actual, "Due date:" + fecha de vencimiento (condicional).

Todo en `text-[9px]`, labels en `font-semibold text-gray-800`.

```tsx
<div className="h-px bg-gray-200 mb-4" />

<div className="flex justify-between mb-5 text-[9px]">
  <div className="space-y-1">
    <p className="font-semibold text-gray-800">Bill to</p>
    <p className="text-gray-600">{selectedCreator ? (selectedCreator.artistic_name || selectedCreator.name) : "—"}</p>
    <p className="font-semibold text-gray-800 mt-2">Address</p>
    <p className="text-gray-600">—</p>
    <p className="font-semibold text-gray-800 mt-2">Phone</p>
    <p className="text-gray-600">—</p>
  </div>
  <div className="space-y-1 text-right">
    <p className="font-semibold text-gray-800">Invoice details</p>
    <p><span className="font-semibold text-gray-800">Invoice no.: </span><span className="text-gray-600">—</span></p>
    <p><span className="font-semibold text-gray-800">Invoice date: </span><span className="text-gray-600">{today}</span></p>
    {dueDate && (
      <p><span className="font-semibold text-gray-800">Due date: </span><span className="text-gray-600">{new Date(dueDate + "T12:00:00").toLocaleDateString("es-ES")}</span></p>
    )}
  </div>
</div>
```

### 2. Tabla de conceptos (líneas 208-236)

- **thead**: 3 columnas — "Product or service", "Description", "Amount" (`text-[8px] uppercase text-gray-500`).
- **tbody**: Fila "Agency Service" (descripción vacía, monto). Fee condicional en rojo.
- **tfoot**: "Total Neto" en bold `text-[11px]` (sin cambios).

```tsx
<thead>
  <tr className="border-b border-gray-200">
    <th className="text-left py-1.5 font-semibold text-gray-500 uppercase tracking-wider text-[8px]">Product or service</th>
    <th className="text-left py-1.5 font-semibold text-gray-500 uppercase tracking-wider text-[8px]">Description</th>
    <th className="text-right py-1.5 font-semibold text-gray-500 uppercase tracking-wider text-[8px]">Amount</th>
  </tr>
</thead>
<tbody>
  <tr className="border-b border-gray-100">
    <td className="py-2 text-gray-700">Agency Service</td>
    <td className="py-2 text-gray-500"></td>
    <td className="py-2 text-right text-gray-800 font-medium">{fmt(amt)}</td>
  </tr>
  {feeAmount > 0 && (
    <tr className="border-b border-gray-100">
      <td className="py-2 text-gray-500">Fee ({feeType === "paypal" ? "PayPal 3.49% + $0.49" : "Manual"})</td>
      <td className="py-2"></td>
      <td className="py-2 text-right text-red-500">-{fmt(feeAmount)}</td>
    </tr>
  )}
</tbody>
```

### 3. Footer del documento (líneas 238-262)

Simplificar a solo notas condicionales (italic) y el pie de página. Eliminar método de pago y vencimiento (ya están en "Invoice details").

```tsx
<div className="mt-auto space-y-2 pt-4">
  {notes && (
    <div className="text-[9px]">
      <span className="text-gray-400">Notes: </span>
      <span className="text-gray-600 italic">{notes}</span>
    </div>
  )}
  <div className="h-px bg-gray-200 mt-3" />
  <p className="text-[8px] text-gray-300 text-center pt-1">
    Documento generado por KASH AGENCY · {today}
  </p>
</div>
```

