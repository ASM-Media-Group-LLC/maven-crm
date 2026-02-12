

# Agregar chart "Earnings by channel" y limpiar duplicados

## Problemas actuales identificados

1. **Header duplicado**: "Estadísticas de creadoras" aparece tanto en `CreatorStatsCards` como en `SalesReportSection`
2. **Filtros redundantes**: `SalesReportSection` tiene sus propios filtros (search, creadora, document ID, fechas, Hoy/Ayer) que duplican los filtros del dashboard (`DashboardFilters`)
3. **Falta**: Chart de "Earnings by channel" (gráfico de líneas por canal con leyenda mostrando %, monto)

## Nuevo orden de la Vista General (según la imagen)

1. EarningsTrendChart (Tendencias de Ganancias - ya existe)
2. **EarningsByChannelChart** (nuevo - gráfico de líneas por canal)
3. ConcentrationChart (Análisis de Concentración - ya existe)
4. CreatorStatsCards (Creator statistics con 4 KPI cards - ya existe)
5. SalesReportSection (tabla simplificada, sin header ni filtros redundantes)

Se elimina `EarningsSummary` ya que su información (Subscriptions, Tips, Messages, etc.) se representara visualmente en el nuevo chart de canal con mas detalle.

## Cambios por archivo

### 1. Crear `src/pages/sales-dashboard/EarningsByChannelChart.tsx`
Gráfico de líneas multi-serie mostrando ganancias diarias por canal:
- **Canales**: Subscriptions, Tips, Posts, Messages, Referrals, Streams
- **Eje X**: Fechas del periodo
- **Eje Y**: Monto en dolares
- **Leyenda lateral derecha**: Cada canal con color, porcentaje del total, y monto total
- Cada canal es una linea con color distinto (similar a la imagen: azul suscripciones, verde tips, rosa posts, naranja messages, cyan referrals, magenta streams)

### 2. Modificar `src/pages/SalesDashboard.tsx`
- Eliminar importacion de `EarningsSummary`
- Agregar importacion de `EarningsByChannelChart`
- Nuevo orden de componentes en Vista General:
  1. EarningsTrendChart
  2. EarningsByChannelChart (nuevo)
  3. ConcentrationChart
  4. CreatorStatsCards
  5. SalesReportSection

### 3. Modificar `src/pages/sales-dashboard/SalesReportSection.tsx`
- Eliminar el header "Estadisticas de creadoras" (ya esta en CreatorStatsCards arriba)
- Eliminar `EarningsFilters` completo (filtros de fecha, creadora, document ID ya estan en DashboardFilters)
- Mantener solo: barra con Custom metrics + Export Excel + un campo de busqueda simple, luego la tabla y paginacion
- Eliminar imports y estado de: `dateFrom`, `dateTo`, `documentFilter`, `creatorFilter`, `relatedCreatorNames`, `relatedDocumentIds`, `handleToday`, `handleYesterday`

## Detalle tecnico del EarningsByChannelChart

```text
+--------------------------------------------------------------+---------------------+
| Earnings by channel (i)                                      |                     |
|                                                              | * Subscriptions  19.60%  $11,071 |
|  10,000 -.........................................            | * Tips            8.82%   $4,982 |
|   8,000 -.........*..........                                | * Posts           0.04%      $23 |
|   6,000 -..--*--*---.--*---.---*..                           | * Messages       71.53%  $40,398 |
|   4,000 -.......................--*                           | * Referrals       0%         $0 |
|   2,000 -..==..==..==..==..==..==                            | * Streams         0%         $0 |
|       0 -..........................                           |                     |
|          Feb 5  Feb 6  Feb 7  Feb 8  Feb 9  Feb 10  Feb 11  |                     |
+--------------------------------------------------------------+---------------------+
```

Datos agrupados por dia, una linea por canal. La leyenda calcula porcentaje y total de cada canal sobre el gran total.

Canales y colores:
- Subscriptions: `hsl(211, 100%, 50%)` (azul)
- Tips: `hsl(145, 63%, 42%)` (verde)
- Posts: `hsl(0, 84%, 60%)` (rosa/rojo)
- Messages: `hsl(25, 95%, 53%)` (naranja)
- Referrals: `hsl(190, 90%, 50%)` (cyan)
- Streams: `hsl(300, 70%, 50%)` (magenta)

## Archivos a crear
- `src/pages/sales-dashboard/EarningsByChannelChart.tsx`

## Archivos a modificar
- `src/pages/SalesDashboard.tsx`
- `src/pages/sales-dashboard/SalesReportSection.tsx`

