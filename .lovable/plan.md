

## Plan: Ajustar tabla de Invoices y agregar descarga PDF

### Problema
1. La tabla muestra columnas innecesarias (Monto, Fee, Neto, Estado). Se requiere solo: Número, Creador, Periodo, Vencimiento, Acciones.
2. No existe funcionalidad de descarga PDF.
3. La tabla `invoices` no almacena `period_start` / `period_end` — se necesitan agregar.

### Cambios

#### 1. Migración SQL — agregar columnas de periodo
Agregar `period_start` y `period_end` (tipo `date`, nullable) a la tabla `invoices`. Actualizar también el insert en `NuevoInvoicePage.tsx` para persistir estos valores.

#### 2. `FacturacionPage.tsx` — simplificar columnas de la tabla
Reemplazar las columnas actuales (Monto, Fee, Neto, Estado) por:
- **Número** (`#invoice_number`)
- **Creador** (avatar + nombre)
- **Periodo** (`period_start — period_end`, formateado `dd/MM/yyyy`)
- **Vencimiento** (`due_date`, formateado `dd/MM/yyyy`)
- **Acciones** — mantener Ver y agregar botón Descargar PDF

Ajustar `colSpan` en filas de loading/vacío.

#### 3. `FacturacionPage.tsx` — botón Descargar PDF en Acciones
Agregar un botón con icono `Download` que genera el PDF del invoice al hacer clic. La generación usará `html2canvas` + `jspdf`:
- Renderizar el componente `InvoiceA4Preview` en un contenedor oculto (off-screen)
- Capturarlo con `html2canvas` a escala 2x para calidad
- Insertar la imagen en un documento `jsPDF` formato A4
- Descargar como `Invoice-{number}.pdf`

#### 4. `NuevoInvoicePage.tsx` — persistir periodo
Agregar `period_start: dateFrom` y `period_end: dateTo` al payload del insert.

### Dependencias a instalar
- `jspdf` y `html2canvas-pro` (o `html2canvas`)

### Archivos a modificar
- **Nueva migración SQL** (add `period_start`, `period_end` to `invoices`)
- `src/pages/finanzas/facturacion/FacturacionPage.tsx`
- `src/pages/finanzas/facturacion/NuevoInvoicePage.tsx`
- `src/integrations/supabase/types.ts` (se sincronizará automáticamente)

