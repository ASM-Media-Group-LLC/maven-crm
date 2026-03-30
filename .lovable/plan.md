

## Plan: Reestructurar Billing & Details en Invoice A4

### Cambio solicitado
Reemplazar el layout actual de 2 columnas (Bill to / Invoice details) por 4 columnas:

```text
Col 1 (Labels)    Col 2 (Creator data)              Col 3 (Label)   Col 4 (ID data)
─────────────     ──────────────────────             ─────────────   ───────────────
Bill to           Creator name (artistic/real)       ID              Creator UUID
Address           billing_address del creador        (vacío)         (vacío)
Phone             phone del creador                  (vacío)         (vacío)
```

La sección "Invoice details" (nº, fecha, vencimiento, payment) permanece a la derecha como está.

### Cambios

#### 1. Ampliar la interfaz `InvoiceData` en `InvoiceA4Preview.tsx`
Agregar `billing_address`, `phone` e `id` (creator UUID) al tipo `creators`:
```ts
creators?: { 
  id?: string;
  name?: string; 
  artistic_name?: string; 
  billing_address?: string; 
  phone?: string;
};
```

#### 2. Actualizar el select de Supabase en `FacturacionPage.tsx` (línea 61)
Cambiar el select para traer los campos adicionales:
```ts
.select("*, creators(id, name, artistic_name, billing_address, phone)")
```
Aplicar el mismo cambio en los otros archivos que usan el mismo select si alimentan el preview (CollectionsPage, ReportesPage).

#### 3. Rediseñar la sección Billing & Details en el componente (líneas 58-78)
Reemplazar el `flex justify-between` actual por un layout con las 4 columnas de datos del creador a la izquierda y los Invoice details a la derecha. Usar un grid de 4 columnas para la parte izquierda donde:
- Col 1: Labels en bold ("Bill to", "Address", "Phone")
- Col 2: Valores del creador (nombre, billing_address, phone)
- Col 3: Label "ID" solo en la primera fila
- Col 4: Creator ID solo en la primera fila

### Archivos a modificar
- `src/pages/finanzas/facturacion/InvoiceA4Preview.tsx` — tipo + layout
- `src/pages/finanzas/facturacion/FacturacionPage.tsx` — select query (línea 61)

