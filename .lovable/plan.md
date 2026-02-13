

# Dashboard Principal Completo

## Resumen

Redisenar completamente el `DashboardContent.tsx` para replicar la estructura mostrada en las imagenes de referencia. El dashboard incluira 5 tarjetas KPI superiores, un grafico de rendimiento semanal, un feed de actividad reciente, distribucion de pipeline (donut), top 5 creadoras, grafico de deals semanales, y 3 tarjetas operacionales inferiores (Customer Service, Closers, Scripts and Tools).

## Estructura Visual

La pagina se organiza en 4 filas:

1. **Header**: Titulo "Dashboard" + subtitulo + botones de accion
2. **5 KPI Cards**: Total Creators, Active Tickets, Promotion Compliance, New Leads Today, Deals in Progress
3. **Fila media** (2 columnas): Rendimiento Semanal (chart lineas) | Actividad Reciente (feed)
4. **Fila inferior parte 1** (3 columnas): Distribucion Pipeline (donut) | Top 5 Creadores (lista numerada) | Deals Semanales (bar chart)
5. **Fila inferior parte 2** (3 columnas): Customer Service | Closers | Scripts and Tools

## Cambios Detallados

### 1. Redisenar `src/components/dashboard/DashboardContent.tsx`

Reescribir el componente completo con las siguientes secciones:

**Header:**
- Titulo: "Dashboard" (`text-2xl font-bold`)
- Subtitulo: "Vista general de toda la operacion en tiempo real" (`text-sm text-muted-foreground`)

**KPI Cards (grid-cols-5):**
Cada card muestra icono, titulo, valor grande coloreado y un subtexto descriptivo:
- **Total Creators**: Usa `useCreadores` hook para contar total de creators. Icono `Users`, color `text-primary`. Subtexto: variacion porcentual.
- **Active Tickets**: Query a tabla `tickets` filtrando `status != 'resolved'`. Icono `Ticket`, color `text-destructive`. Subtexto: "X closed".
- **Promotion Compliance**: Placeholder con valor "--" o "39%". Icono `CalendarCheck`, color `text-warning`. Subtexto: "Weekly average".
- **New Leads Today**: Query a tabla `leads` filtrando por `created_at` de hoy. Icono `MessageSquare`, color `text-accent`. Subtexto: "X interested".
- **Deals in Progress**: Query a tabla `leads` filtrando por status relevante. Icono `Phone`, color `text-success`. Subtexto: "X closed".

**Rendimiento Semanal (lg:col-span-2):**
- Card con titulo "Rendimiento Semanal" y subtitulo "Leads, Deals y Compliance"
- Grafico de lineas (Recharts) con 3 series: Leads, Deals, Compliance %
- Eje X: Lun-Dom
- Datos reales si estan disponibles, sino placeholder con datos de ejemplo

**Actividad Reciente:**
- Card con titulo "Actividad Reciente" y subtitulo "Ultimas acciones del sistema"
- Lista de los ultimos tickets creados (query a `tickets` ordenados por `created_at desc limit 5`)
- Cada item muestra: icono rojo, titulo del ticket, fecha formateada

**Distribucion Pipeline (donut):**
- Card con PieChart (Recharts) tipo donut
- Datos de leads agrupados por status (New, Contacted, In Call, Closed)
- Leyenda debajo con colores y conteos

**Top 5 Creadores:**
- Card con lista numerada del 1-5
- Usa datos de `useCreadores` o `useEarningsData` para obtener los top 5 por earnings
- Cada fila: numero en circulo, nombre, subtexto con followers/earnings

**Deals Semanales:**
- Card con BarChart (Recharts) 
- Barras verdes por dia de la semana (Lun-Dom)
- Datos placeholder inicialmente

**3 Tarjetas Operacionales (grid-cols-3):**

Cada tarjeta tiene un borde superior coloreado y lista de items con badges numericos:

- **Customer Service** (borde rosa/destructive):
  - Icono `Headphones`, subtitulo "Tickets de soporte"
  - Items: "Urgentes" (badge count), "Cerrados" (badge count)
  - Footer: "Tasa Resolucion: X%"

- **Closers** (borde azul/primary):
  - Icono `Phone`, subtitulo "Actividad de ventas"
  - Items: "En llamada" (badge), "Cerrados" (badge), "Pipeline" (badge)

- **Scripts and Tools** (borde morado/accent):
  - Icono `FileCode`, subtitulo "Recursos del equipo"
  - Items: "Scripts activos" (badge), "Templates" (badge), "Objetivos" (badge)

### 2. Agregar `ClariAiFab` al Dashboard principal

Importar y colocar `ClariAiFab` en `src/pages/Dashboard.tsx` dentro del `SidebarProvider`.

### 3. Limpiar `DashboardMetricCard.tsx`

Se mantiene pero se actualiza para soportar las nuevas props: `subtitle` (texto descriptivo), `valueColor` (color del valor principal), y se remueve el icono de trend para usar el subtitulo en su lugar.

## Datos y Queries

- **Creators**: Reutiliza `useCreadores` existente (tabla `creators`)
- **Tickets**: Query directa a tabla `tickets` (ya existe en Supabase)
- **Leads**: Query directa a tabla `leads` (ya existe en Supabase)
- **Earnings**: Reutiliza `useEarningsData` existente
- **Deals/Compliance/Scripts**: Datos placeholder inicialmente (no hay tablas dedicadas)

## Archivos a modificar

- `src/components/dashboard/DashboardContent.tsx` -- rediseno completo
- `src/components/dashboard/DashboardMetricCard.tsx` -- actualizar props para subtitulo y color
- `src/pages/Dashboard.tsx` -- agregar ClariAiFab

## Detalles tecnicos

- Se usan `useQuery` de TanStack para las queries de tickets y leads directamente en DashboardContent
- Los graficos usan Recharts (LineChart, PieChart, BarChart) ya instalado
- Las tarjetas operacionales inferiores usan un borde superior de 3px con `border-t-[3px]` y colores semanticos
- Los badges numericos en las tarjetas operacionales usan `Badge` con colores personalizados
- El layout sigue el patron existente: `main` con `flex-1 overflow-auto p-6 space-y-6`
- Header consistente con el resto de paginas: `text-2xl font-bold` para titulo

