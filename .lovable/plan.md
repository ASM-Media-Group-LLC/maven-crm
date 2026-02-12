

# Nueva Pagina: Creator Sales Overview

## Resumen
Crear una pagina nueva en la ruta `/sales-overview` dentro del menu "Creator Sales" del sidebar. Esta pagina tendra cards de resumen con KPIs y cards operativas clickeables que abren modales con detalle, inspirada en las imagenes de referencia. La pagina `/salesdashboard` existente NO se modifica.

## Estructura de la pagina

```text
+--------------------------------------------------+
| Creator Sales Overview                             |
| Analitica y seguimiento  [$76.9K] [+0.0%] [67]    |
+--------------------------------------------------+
| [Hoy] [7 dias] [Este mes]         01 feb - 12 feb |
+--------------------------------------------------+
|  KPI CARDS (5 cards en fila)                       |
|  Ingresos | Net Earn | Creadoras | Subiendo |Riesg|
|  $76.9K   | $61.5K   | 67        | 3        | 2   |
+--------------------------------------------------+
|  CARDS OPERATIVAS (2 filas x 5 cards)              |
|  Comparativ| Top 10  | Subiendo | Bajando |AltoPo |
|  En Riesgo | Alertas | Calendar | ClariAI | Todas |
+--------------------------------------------------+
```

## Datos y logica

Toda la data proviene del hook existente `useEarningsData` (tabla `of_gross_earnings` + `creators`). Los calculos:

- **Ingresos Total**: suma de `total_earnings_gross` del periodo
- **Net Earnings**: Total * 0.80
- **Creadoras activas**: count de creators unicos en el periodo
- **Subiendo**: creadoras con earnings periodo actual > periodo anterior
- **En Riesgo**: creadoras con earnings actual < periodo anterior (caida > 20%)
- **Top 10**: ordenadas por earnings descendente
- **Comparativas**: mini sparkline de los ultimos 4 periodos

## Archivos nuevos

### 1. `src/pages/SalesOverview.tsx`
Pagina principal con el layout SaaS estandar (Sidebar + Topbar + contenido). Contiene:
- Filtros de periodo (reutiliza la logica de `getDateRange` de SalesDashboard)
- Renderiza los nuevos componentes

### 2. `src/pages/sales-overview/SalesOverviewHeader.tsx`
Header con titulo "Creator Sales Overview", subtitulo, y badges inline con total earnings, variacion %, y creadoras activas.

### 3. `src/pages/sales-overview/SalesOverviewFilters.tsx`
Filtros de periodo (Hoy, 7 dias, Este mes) con indicador de rango de fechas. Similar a DashboardFilters pero sin tabs de vista.

### 4. `src/pages/sales-overview/SalesKPICards.tsx`
Grid de 5 KPI cards:
- Cada card: icono, titulo, valor grande, variacion %, linea de progreso con color semantico
- Cards "Subiendo" y "En Riesgo" clickeables (abren modal)

### 5. `src/pages/sales-overview/SalesOperationalCards.tsx`
Grid de 10 cards operativas:
- **Comparativas**: mini sparkline (recharts LineChart)
- **Top 10**: lista de top 3 creadoras con nombre y monto
- **Subiendo**: creadoras con mayor crecimiento
- **Bajando**: creadoras con mayor caida
- **Alto Potencial**: creadoras con +30% crecimiento
- **En Riesgo**: monto total en riesgo
- **Alertas**: conteo de alertas activas
- **Calendario**: conteo de eventos del periodo
- **Clari AI**: link a `/aisales`
- **Todas**: resumen con distribucion

Cada card clickeable abre `CardDetailModal`.

### 6. `src/pages/sales-overview/CardDetailModal.tsx`
Dialog modal reutilizable que recibe un `cardType` y muestra:
- Tabla de creadoras filtrada segun el contexto
- Metricas detalladas
- Boton para navegar al perfil

### 7. `src/pages/sales-overview/usePeriodComparison.ts`
Hook que recibe `allRows` y `dateRange`, calcula:
- Periodo anterior automaticamente (misma duracion)
- Variacion por creadora (crecimiento/caida)
- Clasificacion: subiendo, bajando, en riesgo, alto potencial

## Archivos a modificar

### 8. `src/components/dashboard/DashboardSidebar.tsx`
Agregar entrada "Overview" en `creatorSalesSubItems`:
```
{ title: "Overview", url: "/sales-overview" }
```
Posicionarla como primer item del submenu Creator Sales.

### 9. `src/App.tsx`
Agregar ruta:
```
<Route path="/sales-overview" element={<SalesOverview />} />
```

## Detalles de diseno

- Las KPI cards usan el patron de hover existente (escala 1.03, gradiente) del design system
- Colores semanticos del sistema: `text-success` para positivo, `text-destructive` para negativo, `text-warning` para alertas
- Cards operativas con border, bg-card, rounded-lg consistente con el resto de la app
- Modal usa el componente Dialog existente de shadcn
- Layout full-width con `h-screen overflow-hidden` segun las constraints de layout

