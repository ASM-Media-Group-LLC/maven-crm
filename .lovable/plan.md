

## Plan: Alinear stats cards de Promolog al Design System (`DashboardMetricCard`)

### Problema

Las stats cards en 3 ubicaciones de Promolog no siguen el estándar de `DashboardMetricCard`:

| Diferencia | Design System | Promolog actual |
|---|---|---|
| Layout | Label arriba, icono arriba-derecha, valor grande abajo | Icono izquierda, valor+label derecha (horizontal) |
| Icono | `rounded-lg`, `h-10 w-10` | `rounded-full`, `h-9 w-9` |
| Hover | `scale-[1.03]` + gradiente | `scale-[1.02]`, sin gradiente |
| Padding | `p-5` | `p-4` |
| Clases dinámicas | Clases completas | `text-${kpi.color}` (no funciona con Tailwind JIT) |

### Ubicaciones afectadas

1. **PromologContent.tsx ~líneas 580-627** — 4 KPI cards principales (Total Promos, Tasa éxito, Sin revisar, Creadoras)
2. **PromologAgentDetailView.tsx ~líneas 274-295** — 5 KPI cards en tab Promos (Total, Sí, Parcial, No, Éxito)
3. **PromologAgentDetailView.tsx ~líneas 366-412** — 4 KPI cards en tab Rendimiento (Total Promos, Promedio/Día, Tasa Éxito, Hoy)

### Solución

Reemplazar las 3 secciones de cards manuales por uso directo de `DashboardMetricCard`, que ya implementa correctamente el estándar (label arriba-izquierda, icono en badge arriba-derecha, valor grande, subtitle, hover con gradiente y escala 1.03).

**PromologContent.tsx** — KPIs principales:
```tsx
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";

<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
  <DashboardMetricCard label="Total Promos" value={String(filteredEntries.length)} icon={Table2} color="accent" />
  <DashboardMetricCard label="Tasa de éxito" value={`${successRate}%`} icon={TrendingUp} color="primary" />
  <DashboardMetricCard label="Sin revisar" value={String(pendingCount)} icon={AlertTriangle} color="destructive" />
  <DashboardMetricCard label="Creadoras" value={String(creatorCount)} icon={Users} color="success" />
</div>
```

La card "Sin revisar" mantiene su `onClick` para abrir el modal, por lo que se envolverá en un `div` con `onClick` y `cursor-pointer`.

**PromologAgentDetailView.tsx** — Ambas secciones (Promos tab y Rendimiento tab):
Mismo patrón, importar `DashboardMetricCard` y usarlo directamente con los colores apropiados. Esto elimina además el bug de clases dinámicas de Tailwind (`text-${kpi.color}`).

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/promolog/PromologContent.tsx` | Reemplazar cards manuales (líneas 580-627) por `DashboardMetricCard` |
| `src/pages/promolog/PromologAgentDetailView.tsx` | Reemplazar cards manuales en ambas secciones (líneas 274-295 y 366-412) por `DashboardMetricCard` |

