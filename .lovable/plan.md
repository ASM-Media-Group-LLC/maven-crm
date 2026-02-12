
# Tab "Rendimiento por Creadora" en Sales Dashboard

## Resumen
Cambiar el comportamiento del tab "Rendimiento por Creadora" para que en lugar de redirigir a `/salesperformancecreator`, muestre un nuevo contenido inline dentro del mismo Sales Dashboard. Este contenido incluira un sidebar de creadoras a la izquierda y paneles de visualizacion a la derecha, replicando el diseno mostrado en las imagenes de referencia.

## Layout general

```text
+------------------------------------------------------------------+
| Reporte de Ventas                          [Exportar CSV]         |
+------------------------------------------------------------------+
| [Vista General] [Rendimiento por Creadora]                        |
| [Date Range Picker]           [Shown by day v] [Net earnings v]   |
+------------------------------------------------------------------+
| Sidebar Creadoras  |  Contenido principal                         |
| [Search] [Refresh] |  1. Earnings (bar chart + category tabs)     |
| [All creators v]   |  2. Earnings breakdown (donut + legend)      |
| - AbbyLondon       |  3. Earnings heatmap (dia x hora)            |
| - Alemiarojas      |  4. Chargebacks (line chart)                  |
| - AnnieDFREE       |                                               |
| - ...              |                                               |
+------------------------------------------------------------------+
```

## Cambios por archivo

### 1. Modificar `DashboardFilters.tsx`
- Eliminar la redireccion `navigate("/salesperformancecreator")` del tab "Rendimiento por Creadora"
- En su lugar, simplemente llamar `onViewChange(tab)` para ambos tabs
- De esta forma el tab se activa en el estado local y el contenido cambia sin navegar

### 2. Modificar `SalesDashboard.tsx`
- Agregar condicion: si `activeView === "Vista General"` mostrar el contenido actual (EarningsSummary, EarningsTrendChart, etc.)
- Si `activeView === "Rendimiento por Creadora"` mostrar el nuevo componente `CreatorPerformanceView`

### 3. Crear `src/pages/sales-dashboard/CreatorPerformanceView.tsx`
Componente principal que organiza el layout de dos columnas:
- **Columna izquierda (sidebar)**: lista de creadoras con busqueda, filtro "All creators", avatar, nombre, badges de conteo. Al seleccionar una creadora se filtran los datos.
- **Columna derecha (contenido)**: renderiza los 4 sub-componentes de visualizacion

Props: `rows: EarningsRow[]` (ya filtradas por el periodo seleccionado)

Estado interno:
- `selectedCreator: string | null` — null = todas las creadoras
- `searchQuery: string`

### 4. Crear `src/pages/sales-dashboard/CreatorSidebar.tsx`
Sidebar de creadoras:
- Input de busqueda con icono Search y boton Refresh
- Dropdown "All creators" (filtro por grupo, por ahora solo "All creators")
- Lista scrolleable de creadoras con:
  - Avatar (iniciales)
  - Nombre truncado
  - Badge con conteo de fans (de `active_fans`)
  - Badge con conteo de documentos/reportes
  - Indicador de estado online (punto verde)
- Al hacer click en una creadora, se selecciona y se resaltan sus datos
- Creadora seleccionada tiene fondo destacado

### 5. Crear `src/pages/sales-dashboard/CreatorEarningsChart.tsx`
Grafico de barras de ganancias por dia (similar al EarningsTrendChart existente pero con tabs de categoria):
- Tabs de filtro: All | Subscriptions | Tips | Posts | Messages | Referrals | Streams
- Grafico de barras usando recharts (BarChart) con eje X = fechas, eje Y = monto
- Al seleccionar una categoria, muestra solo ese tipo de earning
- Cuando hay una creadora seleccionada, filtra los datos a esa creadora

### 6. Crear `src/pages/sales-dashboard/EarningsBreakdownChart.tsx`
Donut chart de desglose de ganancias:
- Usa recharts PieChart con innerRadius para efecto donut
- Segmentos: Subscriptions, Tips, Posts, Messages, Referrals, Streams
- Colores distintos por segmento (naranja, azul, rojo, etc.)
- Leyenda inferior con monto y porcentaje por categoria
- Panel lateral derecho con cada categoria mostrando: monto, badge de variacion %, y mini sparkline decorativo
- Tooltip al hover mostrando "Total earnings from: [categoria] $X"

### 7. Crear `src/pages/sales-dashboard/EarningsHeatmap.tsx`
Heatmap de ganancias por hora del dia:
- Eje Y: fechas (Feb 05, Feb 06, etc.)
- Eje X: horas (12 AM - 11 PM, 24 columnas)
- Cada celda es un cuadrado coloreado por intensidad (blanco/azul claro a azul oscuro)
- Tooltip al hover: "Feb 09 at 11 AM / Total sales: X"
- Barra de escala de color debajo (0 a max)
- Crosshair al hover (lineas punteadas horizontal y vertical)
- Implementado como SVG/divs ya que recharts no tiene heatmap nativo

### 8. Crear `src/pages/sales-dashboard/ChargebacksChart.tsx`
Grafico de linea para chargebacks:
- Usa recharts LineChart
- Eje X: fechas del periodo
- Eje Y: monto en dolares
- Linea con puntos (dots) en cada fecha
- Tooltip: "Feb 7 / Earnings: $0 / Growth: 0.00%"
- Por ahora mostrara datos en $0 ya que no hay campo de chargebacks en la tabla

## Datos y mapeo de campos

De la tabla `of_gross_earnings` / tipo `EarningsRow`:
- **Subscriptions**: `subscription_gross`
- **Tips**: `tips_gross`
- **Messages**: `message_gross`
- **Posts**: no hay campo, valor 0
- **Referrals**: no hay campo, valor 0
- **Streams**: no hay campo, valor 0
- **Chargebacks**: no hay campo, valor 0
- **Active fans**: `active_fans`
- **Hora**: `report_time` (para el heatmap)
- **Fecha**: `effective_date`

## Archivos a crear
- `src/pages/sales-dashboard/CreatorPerformanceView.tsx`
- `src/pages/sales-dashboard/CreatorSidebar.tsx`
- `src/pages/sales-dashboard/CreatorEarningsChart.tsx`
- `src/pages/sales-dashboard/EarningsBreakdownChart.tsx`
- `src/pages/sales-dashboard/EarningsHeatmap.tsx`
- `src/pages/sales-dashboard/ChargebacksChart.tsx`

## Archivos a modificar
- `src/pages/sales-dashboard/DashboardFilters.tsx` — quitar navigate, usar onViewChange directamente
- `src/pages/SalesDashboard.tsx` — renderizar condicionalmente Vista General vs CreatorPerformanceView
