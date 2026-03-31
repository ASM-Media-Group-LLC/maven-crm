

## Plan: Cambiar ruta de Invoices a `/finanzas/facturacion/invoices`

### Por qué es mejor
Tienes razón — cambiar la URL de Invoices de `/finanzas/facturacion` a `/finanzas/facturacion/invoices` elimina el conflicto de prefijos de raíz, sin necesidad de lógica compleja en el sidebar. Solución limpia y definitiva.

### Cambios

**1. `src/App.tsx`** — Cambiar la ruta del componente `FacturacionPage`:
- `/finanzas/facturacion` → `/finanzas/facturacion/invoices`

**2. `src/components/dashboard/DashboardSidebar.tsx`** — Actualizar URL del item:
- `{ title: "Invoices", url: "/finanzas/facturacion/invoices" }`

**3. Actualizar todas las referencias de navegación** (navigate, links, breadcrumbs):
- `NuevoInvoicePage.tsx` — ~4 referencias a `navigate("/finanzas/facturacion")`
- `NuevaNotaPagoPage.tsx` — ~4 referencias a `navigate("/finanzas/facturacion")`
- `FinanzasDashboard.tsx` — 1 referencia en el path de "Invoices por enviar"
- `notificationHelpers.ts` — 1 referencia en el link de notificación de invoice

**4. Opcional**: Agregar un redirect de `/finanzas/facturacion` → `/finanzas/facturacion/invoices` para no romper bookmarks existentes.

### Archivos a modificar (6)

| Archivo | Cambios |
|---------|---------|
| `App.tsx` | Ruta de FacturacionPage |
| `DashboardSidebar.tsx` | URL del item Invoices |
| `NuevoInvoicePage.tsx` | navigates de vuelta |
| `NuevaNotaPagoPage.tsx` | navigates de vuelta |
| `FinanzasDashboard.tsx` | path del card |
| `notificationHelpers.ts` | link de notificación |

