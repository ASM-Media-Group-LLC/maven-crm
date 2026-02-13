

# Renombrar Overview a Dashboard y crear pagina interna de Comparativas

## Resumen

Se renombrara la seccion "Overview" del sidebar a "Dashboard" y se convertiran las cards operacionales en enlaces a paginas internas dedicadas. La primera pagina interna a construir sera "Comparativas", basada en las imagenes de referencia proporcionadas.

## Cambios

### 1. Renombrar en sidebar
En `DashboardSidebar.tsx`, cambiar el titulo "Overview" a "Dashboard" para el sub-item que apunta a `/sales-overview`.

### 2. Convertir cards en enlaces a paginas internas
En `SalesOperationalCards.tsx`, cambiar el comportamiento de las cards para que en lugar de abrir un modal, naveguen a rutas internas. La card "Comparativas" navegara a `/sales-overview/comparativas`. Las demas cards mantendran su comportamiento actual (modal) por ahora, y se iran convirtiendo a paginas internas en futuras iteraciones.

### 3. Crear pagina de Comparativas (`/sales-overview/comparativas`)

Nueva pagina completa con la siguiente estructura basada en las imagenes de referencia:

**Header:**
- Breadcrumb: Creator Sales > Comparativas
- Titulo: "Comparativas" con subtitulo "Analisis mes vs mes"
- Filtros de periodo: Hoy, 7 dias, Este mes + selector de rango de fechas

**Seccion de KPIs (3 cards en fila):**
- Mes Actual vs Anterior: monto actual, monto anterior, porcentaje de cambio, barra de progreso
- Hoy vs Ayer: monto de hoy, porcentaje de cambio, monto de ayer
- Tendencias: conteo de creadoras subiendo y bajando con iconos

**Seccion de Graficos (2 columnas):**
- Evolucion de Ingresos (4 meses): grafico de linea con puntos marcados (3M ago, 2M ago, Prev, Current) usando Recharts
- Comparacion Directa: grafico de barras horizontales comparando periodo actual vs anterior

**Seccion de Proyecciones (2 columnas):**
- Proyeccion Fin de Mes: monto proyectado, barra de progreso del mes, promedio diario, dias restantes
- Desglose de Revenue: barras horizontales por canal (Subscriptions, Messages, Tips, PPV) con montos y porcentajes

**Seccion de Rankings (3 columnas):**
- Mayor Crecimiento: top 5 creadoras con mayor crecimiento porcentual, con avatar y badge
- Top Performers: top 5 creadoras por ingresos con numeracion y avatars
- Requieren Atencion: creadoras con caida o riesgo, con avatar y porcentaje en rojo

**Tabla Comparativa Completa:**
- Columnas: #, Creadora (con avatar), periodo actual, periodo anterior, Cambio %, Hoy, Trend
- Header fijo con scroll en el body

### 4. Agregar ruta en App.tsx
Agregar la ruta `/sales-overview/comparativas` apuntando al nuevo componente.

## Archivos a crear
- `src/pages/sales-overview/ComparativasPage.tsx` -- pagina principal con layout, sidebar y topbar
- `src/pages/sales-overview/comparativas/ComparativasHeader.tsx` -- breadcrumb, titulo y filtros
- `src/pages/sales-overview/comparativas/ComparativasKPIs.tsx` -- 3 cards de KPIs superiores
- `src/pages/sales-overview/comparativas/EvolucionChart.tsx` -- grafico de linea de 4 meses
- `src/pages/sales-overview/comparativas/ComparacionDirectaChart.tsx` -- barras horizontales
- `src/pages/sales-overview/comparativas/ProyeccionCard.tsx` -- proyeccion fin de mes
- `src/pages/sales-overview/comparativas/DesgloseRevenueCard.tsx` -- desglose por canal
- `src/pages/sales-overview/comparativas/RankingCards.tsx` -- Mayor Crecimiento, Top Performers, Requieren Atencion
- `src/pages/sales-overview/comparativas/ComparativaTable.tsx` -- tabla comparativa completa

## Archivos a modificar
- `src/components/dashboard/DashboardSidebar.tsx` -- renombrar "Overview" a "Dashboard"
- `src/pages/sales-overview/SalesOperationalCards.tsx` -- card "Comparativas" navega a `/sales-overview/comparativas`
- `src/App.tsx` -- agregar ruta `/sales-overview/comparativas`

## Detalles tecnicos

- Todos los graficos usaran Recharts (ya instalado)
- Los datos se obtendran del mismo hook `useEarningsData` y `usePeriodComparison` existentes
- La proyeccion de fin de mes se calcula: (promedio diario del periodo actual) x 30 dias
- El desglose de revenue usara los campos `subscription_gross`, `message_gross`, `tips_gross` del tipo `EarningsRow`
- Los avatars usaran las iniciales del nombre artistico como placeholder
- El tema visual sigue el dark mode actual del proyecto con las variables CSS existentes (card, muted-foreground, success, destructive, etc.)

