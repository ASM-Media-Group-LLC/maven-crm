
## 1. Operaciones (Sales Overview): Reemplazar selector de periodo por DateRangePicker

Actualmente `SalesOverviewFilters.tsx` usa tres botones fijos ("Hoy", "Esta semana", "Este mes") y muestra un rango de fecha estatico. Se reemplazara por el componente `DateRangePicker` (el mismo que usa Eventos), que ya incluye presets rapidos (Hoy, Ayer, Esta semana, etc.) y calendario dual.

**Archivo: `src/pages/sales-overview/SalesOverviewFilters.tsx`**
- Importar `DateRangePicker` de `@/components/ui/date-range-picker`
- Reemplazar los botones de periodo y el display de fecha por un unico `DateRangePicker`
- Cambiar la interfaz Props para recibir `from`, `to` y `onDateChange` en lugar de `activePeriod` y `onPeriodChange`

**Archivo: `src/pages/SalesOverview.tsx`**
- Reemplazar el estado `activePeriod` por estados `dateFrom` y `dateTo` (inicializados con "Esta semana")
- Pasar los nuevos props al componente de filtros
- Adaptar el calculo de `dateRange` para usar los estados directamente

## 2. Uniformizar tamano de barras de busqueda

El patron estandar sera `relative flex-1` sin restriccion `max-w-*`, permitiendo que la barra ocupe todo el espacio disponible. Solo se usara `max-w-xs` cuando haya 4+ filtros adicionales en la misma linea.

| Archivo | Cambio |
|---------|--------|
| `src/pages/promolog/PromologContent.tsx` (linea 318) | Cambiar `max-w-xs` a `flex-1` sin max (tiene 4 selects + date + view toggle, pero el date es compacto) -- en realidad con tantos filtros conviene mantener `max-w-xs`. Se mantiene. |
| `src/pages/leadgen/LeadGenContent.tsx` (linea 130) | Cambiar `max-w-xs` a `flex-1` sin max -- misma situacion, se mantiene |
| `src/pages/tareas/TareasContent.tsx` (linea 124) | Cambiar `max-w-sm` a `flex-1` (pocos filtros, puede expandirse) |
| `src/pages/tareas/ProjectsListContent.tsx` (linea 75) | Cambiar `max-w-sm` a `flex-1` |

Conclusion: Las barras con pocos filtros (Tareas, Proyectos, Eventos) usaran `flex-1` sin restriccion. Las que tienen muchos filtros (Promolog, LeadGen) mantendran `max-w-xs`. El objetivo es que todas las barras con la misma cantidad de filtros se vean iguales.

## 3. Promolog: Hover animado en KPI cards y social cards

**KPI Cards (lineas 383-423)**: Agregar el patron estandar de hover:
- `transition-all duration-200 cursor-pointer hover:scale-[1.03] hover:bg-gradient-to-br hover:from-[color]/15 hover:to-transparent hover:border-[color]/40`
- Cada card usa su color semantico: accent, primary, destructive, success

**Social Cards (lineas 434-446)**: Agregar hover animado:
- `transition-all duration-200 cursor-pointer hover:scale-[1.03] hover:shadow-lg`

**Platform Cards (lineas 450-462)**: Mismo patron de hover que social cards.

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/sales-overview/SalesOverviewFilters.tsx` | Reemplazar por DateRangePicker |
| `src/pages/SalesOverview.tsx` | Adaptar estado y props para DateRangePicker |
| `src/pages/promolog/PromologContent.tsx` | Agregar hover animado a KPI, social y platform cards |
| `src/pages/tareas/TareasContent.tsx` | Quitar max-w-sm del buscador |
| `src/pages/tareas/ProjectsListContent.tsx` | Quitar max-w-sm del buscador |

## Detalle tecnico

Para SalesOverview, el estado cambia de:
```text
activePeriod: OverviewPeriod  -->  dateFrom: Date, dateTo: Date
```

Se inicializa con el rango de "Esta semana" y el `DateRangePicker` permite seleccionar cualquier rango. Los componentes hijos (`SalesKPICards`, `SalesOperationalCards`) ya reciben datos filtrados a traves de `usePeriodComparison`, que usa `dateRange`, asi que solo hay que asegurar que `dateRange` se derive de los nuevos estados.

Para las cards de Promolog, el patron de hover sigue exactamente el documentado en el Design System (seccion Card Hover Animations).
