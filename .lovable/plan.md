

## Plan: Código postal en templates + consistencia visual de tabla

### 1. Migración SQL — nueva columna `company_zip`

```sql
ALTER TABLE public.invoice_templates ADD COLUMN company_zip text;
```

### 2. `CreateTemplateModal.tsx` — agregar campo "Código postal"

- Nuevo state `companyZip` inicializado desde `template?.company_zip`
- Input debajo de "Dirección" con label "Código postal" y placeholder "Ej: 33131"
- Incluir `company_zip` en el payload del insert/update (solo cuando `type === "invoice"`)

### 3. `InvoiceA4Preview.tsx` — mostrar zip en header

- Agregar `company_zip?: string | null` a la interfaz `TemplateInfo`
- En el header, después de las líneas de dirección y antes del email, mostrar el zip si existe:
```tsx
{companyZip && <p className="text-[9px] text-gray-400">{companyZip}</p>}
```

### 4. `TemplatesPage.tsx` — replicar estructura de tabla de Invoices

Cambios para igualar la tabla de `FacturacionPage.renderInvoiceTable`:

| Aspecto | Actual (Templates) | Objetivo (como Invoices) |
|---------|-------------------|-------------------------|
| Contenedor | Sin borde ni overflow | `rounded-lg border border-border overflow-hidden` + `overflow-auto max-h-[calc(100vh-20rem)]` |
| Header row | Bg `background` | `bg-card border-b` |
| Filas hover | Default | `group hover:bg-muted/30 transition-colors` |
| Col Acciones | `text-right w-[80px]` | `sticky right-0 bg-card` con hover sync |
| Botones acción | `variant="ghost" size="icon"` | Tooltips envolventes como en Invoices |
| Columna `#` | Número manual | Eliminar — no existe en Invoices |
| Badge tipo | Inline | Mantener pero con mismo estilo |

Estructura final de columnas: **Nombre, Tipo, Fecha creación, Creador, Acciones** (sin `#`).

### 5. Actualizar queries que usen `invoice_templates`

- `NuevoInvoicePage.tsx` línea 102: agregar `company_zip` al select
- `TemplatesPage.tsx`: ya usa `select("*")`, se incluye automáticamente
- `TemplatesPage.tsx` view modal: pasar `company_zip` al `InvoiceA4Preview`

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| Migración SQL | `ADD COLUMN company_zip text` |
| `CreateTemplateModal.tsx` | Nuevo campo zip + incluir en payload |
| `InvoiceA4Preview.tsx` | Agregar `company_zip` a `TemplateInfo`, renderizar en header |
| `TemplatesPage.tsx` | Reestructurar tabla para igualar Invoices, pasar `company_zip` al preview |
| `NuevoInvoicePage.tsx` | Agregar `company_zip` al select de templates |

