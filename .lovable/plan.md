

## Plan: Vista previa A4 en Templates + integración en creación de Invoice

### Situación actual
- La página de Templates ya existe con tabla, modal de creación/edición, y un botón "Ver" que abre un modal simple con texto plano (nombre, dirección, email, logo).
- `InvoiceA4Preview.tsx` ya acepta un prop `template` opcional y aplica sus datos al header del documento.
- `NuevoInvoicePage.tsx` ya tiene un selector de template que carga templates tipo "invoice" y pasa el seleccionado al preview inline — pero **no usa el componente `InvoiceA4Preview`**, tiene el A4 duplicado inline.

### Cambios

#### 1. TemplatesPage.tsx — Reemplazar modal de "Ver" con preview A4

Sustituir el modal actual (texto plano) por un Dialog/modal más amplio que renderice `InvoiceA4Preview` pasando el template seleccionado. Se usarán datos de ejemplo (placeholder) para el invoice (nombre ficticio, montos en cero) para que el usuario vea cómo quedará el branding del documento.

#### 2. NuevoInvoicePage.tsx — Usar InvoiceA4Preview en lugar del A4 inline

Reemplazar el bloque de preview A4 duplicado (líneas ~297-420) por el componente `InvoiceA4Preview`, pasándole el `selectedTemplate` y los datos calculados del invoice. Esto elimina duplicación y garantiza consistencia entre el preview de templates y la creación de invoices.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/finanzas/facturacion/TemplatesPage.tsx` | Reemplazar modal de vista plana por Dialog con `InvoiceA4Preview` usando datos de ejemplo + template |
| `src/pages/finanzas/facturacion/NuevoInvoicePage.tsx` | Reemplazar A4 inline por `InvoiceA4Preview` component, pasando template y datos del formulario |

No se requieren cambios en la base de datos ni en `InvoiceA4Preview.tsx` — el componente ya soporta el prop `template`.

