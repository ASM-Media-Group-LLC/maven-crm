
# Integrar Sales Report en la tabla "Estadisticas de Creadoras" del Sales Dashboard

## Resumen
Reemplazar el componente simplificado `CreatorsTable` en la Vista General del Sales Dashboard por una version completa que incluya las mismas funcionalidades del Sales Report (`/salesperformancecreator`): filtros avanzados (busqueda, creadora, document ID, fechas, paginacion), tarjetas de resumen (KPIs), tabla detallada con todas las columnas configurables, selector de columnas visibles (Custom metrics), paginacion y exportacion a Excel.

## Cambios

### 1. Crear `src/pages/sales-dashboard/SalesReportSection.tsx`
Nuevo componente que encapsula toda la logica del Sales Report adaptada para funcionar inline dentro del Sales Dashboard. Recibe `rows: EarningsRow[]` (ya filtradas por periodo) y opcionalmente `comparedRows`.

Incluira:
- Header con titulo "Estadisticas de creadoras", boton "Custom metrics" y boton "Exportar Excel"
- `EarningsFilters` (busqueda, filtro por creadora, filtro por document ID, rango de fechas, paginacion)
- `EarningsSummaryCards` (5 KPIs: Creators, Total Earnings, Subscriptions, Messages, Tips)
- `EarningsTable` (tabla completa con todas las columnas, ordenacion, link/unlink de creadoras)
- `EarningsPagination` (cuando la paginacion no es "all")

Toda la logica de estado (filtros, sort, paginacion, columnas visibles, exportacion Excel) se replica desde `SalesPerformanceCreator.tsx` pero operando sobre los `rows` recibidos por props en lugar de cargar datos propios.

### 2. Modificar `src/pages/SalesDashboard.tsx`
- Reemplazar la importacion y uso de `CreatorsTable` por el nuevo `SalesReportSection`
- Pasar `filteredRows` y `comparedRows` como props
- Eliminar la importacion de `CreatorsTable`

### 3. Archivos reutilizados (sin modificar)
Los siguientes componentes del Sales Report se reutilizan directamente:
- `EarningsFilters` — filtros avanzados
- `EarningsSummaryCards` — tarjetas KPI
- `EarningsTable` — tabla con todas las columnas y acciones
- `EarningsPagination` — controles de paginacion
- `CustomMetrics` — selector de columnas visibles
- `LinkCreatorModal` — modal para vincular creadoras (ya incluido dentro de EarningsTable)

## Detalle tecnico

### SalesReportSection.tsx - Estructura interna

```text
+-------------------------------------------------------------------+
| Estadisticas de creadoras    [Custom metrics] [Exportar Excel]    |
+-------------------------------------------------------------------+
| [Search] [Creadora: Todas v] [Document ID: Todos v]               |
| [Desde] [Hasta] [Hoy] [Ayer]           [Por pagina: 50 v] N regs |
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

El componente gestionara internamente:
- `documentFilter`, `creatorFilter`, `searchQuery` — filtros
- `dateFrom`, `dateTo` — rango de fechas adicional (sobre los rows ya filtrados por periodo)
- `sortField`, `sortDirection` — ordenacion
- `currentPage`, `pageSize` — paginacion
- `visibleColumns` — columnas visibles

La exportacion a Excel usara la misma logica con `xlsx` que ya existe en `SalesPerformanceCreator`.

## Archivos a crear
- `src/pages/sales-dashboard/SalesReportSection.tsx`

## Archivos a modificar
- `src/pages/SalesDashboard.tsx` — reemplazar `CreatorsTable` por `SalesReportSection`
