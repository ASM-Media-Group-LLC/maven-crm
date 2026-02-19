
## Acortar textos del sidebar en Creadores y Ventas de Creadores

### Problema
Como se ve en la imagen, los textos largos en los sub-ítems del sidebar se parten en dos líneas, amontonando el menú.

### Cambios únicamente en `src/components/dashboard/DashboardSidebar.tsx`

**Submenú de Creadores:**

| Antes | Después |
|---|---|
| `"Dashboard de Creadores"` | `"Dashboard"` |
| `"Listado"` | `"Listado"` (sin cambio) |
| `"Onboarding"` | `"Onboarding"` (sin cambio) |

**Submenú de Ventas de Creadores** (sub-ítems en `creatorSalesSubItems`):

| Antes | Después |
|---|---|
| `"Dashboard"` | `"Dashboard"` (sin cambio) |
| `t("nav.salesReport")` → `"Reporte de Ventas"` | `"Reportes"` (hardcodeado corto) |
| `t("nav.aiSales")` → `"IA Ventas"` | `"IA Ventas"` (sin cambio, cabe en una línea) |
| `t("nav.aiConfig")` → `"Configuración IA"` | `"Config IA"` (acortado) |

> Las páginas internas mantienen sus títulos completos (`"Dashboard de Creadores"`, `"Reporte de Ventas"`, etc.) — solo cambia lo que se muestra en el sidebar.

### Solo 1 archivo a modificar

- `src/components/dashboard/DashboardSidebar.tsx`
