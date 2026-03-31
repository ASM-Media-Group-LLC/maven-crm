

## Plan: Preview A4 en Templates sin datos de ejemplo

### Problema
El botón "Ver" en templates muestra un modal de texto plano. Se quiere mostrar el `InvoiceA4Preview` pero **sin datos ficticios de invoice** — solo el branding del template (logo, nombre de empresa, dirección, email).

### Cambio

**Archivo: `src/pages/finanzas/facturacion/TemplatesPage.tsx`**

Reemplazar el modal actual (líneas 137-156) por uno más amplio que renderice `InvoiceA4Preview` con:
- `template`: datos reales del template (company_name, company_address, company_email, logo_url)
- `invoice`: objeto vacío `{}` — sin número, sin montos, sin nombre de creador, sin fechas

Esto mostrará la estructura del documento A4 con el branding aplicado (header con logo y datos de empresa) pero todas las celdas de datos del invoice quedarán en blanco o con guiones ("—"), dejando claro que es solo una vista previa del template.

Modal con `max-w-2xl`, fondo oscuro, scroll interno, y botón "Cerrar".

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `TemplatesPage.tsx` | Reemplazar modal texto plano por `InvoiceA4Preview` con invoice vacío `{}` |

