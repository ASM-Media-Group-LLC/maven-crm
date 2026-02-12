
# Integrar Sales Report en "Estadísticas de Creadoras" del Sales Dashboard

## Resumen
Reemplazar el componente simplificado `CreatorsTable` en la Vista General del Sales Dashboard por un nuevo componente `SalesReportSection` que incluya toda la funcionalidad del Sales Report: filtros avanzados, KPIs, tabla detallada con columnas configurables, paginación y exportación a Excel.

## Cambios

### 1. Crear `src/pages/sales-dashboard/SalesReportSection.tsx`
Nuevo componente que encapsula la lógica completa del Sales Report, adaptada para funcionar inline. Recibe `rows: EarningsRow[]` (ya filtradas por periodo) y opcionalmente `comparedRows`.

Incluirá:
- Header con título "Estadísticas de creadoras", botón "Custom metrics" y botón "Exportar Excel"
- `EarningsFilters` (búsqueda, filtro por creadora, filtro por document ID, rango de fechas, paginación)
- `EarningsSummaryCards` (5 KPIs: Creators, Total Earnings, Subscriptions, Messages, Tips)
- `EarningsTable` (tabla completa con todas las columnas, ordenación, link/unlink de creadoras)
- `EarningsPagination` (cuando la paginación no es "all")

Toda la lógica de estado (filtros, sort, paginación, columnas visibles, exportación Excel) se replica desde `SalesPerformanceCreator.tsx` pero operando sobre los `rows` recibidos por props en lugar de cargar datos propios.

### 2. Modificar `src/pages/SalesDashboard.tsx`
- Reemplazar la importación y uso de `CreatorsTable` por el nuevo `SalesReportSection`
- Pasar `filteredRows` y `comparedRows` como props
- Eliminar la importación de `CreatorsTable`

### 3. Archivos reutilizados (sin modificar)
Los siguientes componentes se reutilizan directamente:
- `EarningsFilters` -- filtros avanzados
- `EarningsSummaryCards` -- tarjetas KPI
- `EarningsTable` -- tabla con todas las columnas y acciones
- `EarningsPagination` -- controles de paginación
- `CustomMetrics` -- selector de columnas visibles
- `LinkCreatorModal` -- modal para vincular creadoras

## Detalle técnico

### SalesReportSection.tsx - Estructura

```text
+-------------------------------------------------------------------+
| Estadísticas de creadoras    [Custom metrics] [Exportar Excel]    |
+-------------------------------------------------------------------+
| [Search] [Creadora: Todas v] [Document ID: Todos v]               |
| [Desde] [Hasta] [Hoy] [Ayer]           [Por página: 50 v] N regs |
+-------------------------------------------------------------------+
| Creators | Total Earnings | Subscriptions | Messages | Tips       |
+-------------------------------------------------------------------+
| Artistic Name | Creator OF | Fecha | Hora | Total | Subs | ...   |
| row 1...                                                          |
| row 2...                                                          |
+-------------------------------------------------------------------+
| [< 1 2 3 ... >]                                                   |
+-------------------------------------------------------------------+
```

Estado interno del componente:
- `documentFilter`, `creatorFilter`, `searchQuery` -- filtros
- `dateFrom`, `dateTo` -- rango de fechas adicional (sobre los rows ya filtrados por periodo)
- `sortField`, `sortDirection` -- ordenación
- `currentPage`, `pageSize` -- paginación
- `visibleColumns` -- columnas visibles
- Cross-filters: `relatedCreatorNames`, `relatedDocumentIds`

La exportación a Excel usa la misma lógica con `xlsx` que ya existe en `SalesPerformanceCreator`.

## Archivos a crear
- `src/pages/sales-dashboard/SalesReportSection.tsx`

## Archivos a modificar
- `src/pages/SalesDashboard.tsx` -- reemplazar `CreatorsTable` por `SalesReportSection`
