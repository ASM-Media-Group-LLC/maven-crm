

## Plan: Actualizar preview inline en NuevoInvoicePage

### Problema
El archivo `NuevoInvoicePage.tsx` tiene su propio preview A4 inline (no usa el componente `InvoiceA4Preview`), por lo que los cambios de layout de 4 columnas no se reflejan ahí.

### Cambios

#### 1. Ampliar el query de creators en `NuevoInvoicePage.tsx` (línea 55)
Agregar `phone` y `creator_business(billing_address)` al select:
```ts
.select("id, name, artistic_name, phone, creator_business(billing_address)")
```

#### 2. Reemplazar la sección Billing del preview inline (líneas 286-303)
Cambiar el layout actual de 2 columnas verticales por el grid de 4 columnas idéntico al de `InvoiceA4Preview.tsx`:

```text
Col 1 (Label)   Col 2 (Value)              Col 3 (Label)   Col 4 (Value)
Bill to         Creator name               ID              Creator UUID
Address         billing_address            (vacío)         (vacío)
Phone           phone                      (vacío)         (vacío)
```

Se extraerá `billing_address` del join `creator_business` y `phone` directamente del creator seleccionado.

### Archivo a modificar
- `src/pages/finanzas/facturacion/NuevoInvoicePage.tsx`

