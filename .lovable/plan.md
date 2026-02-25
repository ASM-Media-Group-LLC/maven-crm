

## Plan: Rediseño de ConfiguracionPage — Vista de Cards con detalle al hacer click

### Concepto

Transformar la página de configuración financiera de un layout de tabs plano a un patrón de dos niveles:

1. **Vista principal (cards)**: Header con título + KPI cards de resumen (siguiendo el patrón de `DashboardMetricCard`) + grid de 5 cards clickeables, cada una representando una sección de configuración
2. **Vista de detalle**: Al hacer click en una card, se muestra la vista de edición a pantalla completa con `ArrowLeft` para volver (patrón de vista interna condicional, sin cambio de ruta)

---

### Estructura

**Estado:** `activeSection: string | null` — `null` = vista principal, `"quickbooks" | "payment_methods" | ...` = vista de detalle

**Vista principal (activeSection === null):**

```
┌─ Header ──────────────────────────────────────────┐
│ Configuración Financiera                          │
│ Parámetros y plantillas del módulo de finanzas    │
├───────────────────────────────────────────────────┤
│ 5 KPI summary cards (DashboardMetricCard pattern) │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ...       │
│ │ Mapeos   │ │ Métodos  │ │ Centros  │           │
│ │ QB: 0    │ │ Pago: 3  │ │ Costo: 3 │           │
│ └──────────┘ └──────────┘ └──────────┘           │
├───────────────────────────────────────────────────┤
│ 5 Config cards (clickeable, icon + desc + badge)  │
│ ┌─────────────────┐  ┌─────────────────┐         │
│ │ 📋 QuickBooks   │  │ 💳 Métodos Pago │         │
│ │ Mapeo categorías│  │ Comisiones      │         │
│ │ 0 mapeos conf.  │  │ 3 métodos act.  │         │
│ └─────────────────┘  └─────────────────┘         │
│ etc.                                              │
└───────────────────────────────────────────────────┘
```

**Vista detalle (activeSection !== null):**

```
┌─ Header ──────────────────────────────────────────┐
│ ← Configuración Financiera > Templates QuickBooks │
├───────────────────────────────────────────────────┤
│ [Contenido actual del tab correspondiente]        │
└───────────────────────────────────────────────────┘
```

---

### KPI Summary Cards (fila superior)

5 cards usando el patrón `DashboardMetricCard` con hover gradient:

| Card | Label | Value | Icon | Subtitle | Color |
|------|-------|-------|------|----------|-------|
| QB Templates | Mapeos QB | `{mappings.length}` | FileText | "cuentas configuradas" | primary |
| Métodos Pago | Métodos de Pago | `{methods.filter(m=>m.active).length}` | CreditCard | "métodos activos" | accent |
| Centros Costo | Centros de Costo | `{centers.length}` | Building2 | presupuesto total formateado | warning |
| Comisiones | Comisiones | `{defaults.creator_pct}%` | Percent | `{exceptions.length} excepciones` | primary |
| Nómina | Parámetros Nómina | `$${params.hour_bank.hour_value}/h` | Calculator | multiplicadores resumidos | accent |

---

### Config Section Cards (grid clickeable)

Grid de 5 cards (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`) con:
- Icono + título en `CardHeader`
- Descripción breve + badge de conteo en `CardContent`
- `cursor-pointer` + hover con gradiente temático (patrón KPI)
- Click ejecuta `setActiveSection("key")`

---

### Detalle técnico

- **Sin rutas nuevas**: Se usa estado interno `activeSection` para alternar entre vista cards y vista detalle
- **Header en detalle**: Usa `ArrowLeft` ghost button para volver (`setActiveSection(null)`) + breadcrumb textual
- **Los 5 componentes de tab existentes** (`QuickBooksTab`, `PaymentMethodsTab`, etc.) se reutilizan sin cambios como contenido del detalle
- **Datos para KPIs**: Se consumen los mismos hooks (`useQuickBooksTemplates`, `usePaymentMethods`, etc.) en el componente principal para mostrar conteos

---

### Archivo modificado

| Archivo | Acción |
|---------|--------|
| `src/pages/finanzas/configuracion/ConfiguracionPage.tsx` | Reescribir sección `ConfiguracionPage` (líneas 353-385) y agregar imports de iconos y DashboardMetricCard. Los 5 componentes de tab internos se mantienen intactos. |

