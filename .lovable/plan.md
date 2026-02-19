
## Corrección de textos en español del Sidebar y páginas

### Problema identificado

Varios textos del sidebar y páginas usan inglés o género incorrecto cuando el idioma es español. Estos son los cambios necesarios:

| Clave / Lugar | Texto actual (ES) | Texto correcto (ES) |
|---|---|---|
| `nav.creatorSales` en `i18n.ts` | `"Creator Sales"` | `"Ventas de Creadores"` |
| `nav.salesReport` en `i18n.ts` | `"Sales Report"` | `"Reporte de Ventas"` |
| `nav.aiSales` en `i18n.ts` | `"AI Sales"` | `"IA Ventas"` |
| `nav.aiConfig` en `i18n.ts` | `"AI Config"` | `"Configuración IA"` |
| Sidebar: subitem hardcodeado `"Dashboard"` (Creadores) | `"Dashboard"` | `"Dashboard de Creadores"` |
| Sidebar: subitem hardcodeado `"Listado"` (Creadores) | `"Listado"` | `"Listado"` (ya está bien) |
| `CreadoresContent.tsx` heading `h1` | `"Listado de Creadoras"` | `"Listado de Creadores"` |
| `CreadorasDashboardContent.tsx` heading | `"Dashboard de Creadoras"` | `"Dashboard de Creadores"` |

> Nota: los sub-ítems del menú de Creadores (`"Dashboard"`, `"Listado"`, `"Onboarding"`) están hardcodeados directamente en `DashboardSidebar.tsx`, no pasan por `i18n.ts`. Se corregirá el género ahí mismo.

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/lib/i18n.ts` | Actualizar 4 claves ES: `creatorSales`, `salesReport`, `aiSales`, `aiConfig` |
| `src/components/dashboard/DashboardSidebar.tsx` | Corregir el subitem `"Dashboard"` del grupo Creadores (no el de Creator Sales) — ahí no hay t() |
| `src/pages/creadores/CreadoresContent.tsx` | `h1` de `"Listado de Creadoras"` → `"Listado de Creadores"` |
| `src/pages/creadores/CreadorasDashboardContent.tsx` | Heading de `"Dashboard de Creadoras"` → `"Dashboard de Creadores"` |

### Resultado esperado en sidebar (modo ES)

```
Creadores ▾
  ├─ Dashboard de Creadores   → /creadores/dashboard
  ├─ Listado                  → /creadores
  └─ Onboarding               → /creadores/onboarding

Ventas de Creadores ▾
  ├─ Dashboard               → /sales-overview
  ├─ Reporte de Ventas       → /salesdashboard
  ├─ IA Ventas               → /aisales
  └─ Configuración IA        → /ai-sales-config
```
