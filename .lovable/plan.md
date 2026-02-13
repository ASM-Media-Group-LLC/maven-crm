

# Crear paginas internas para cards del Dashboard y agregar animaciones hover

## Resumen

Se crearan paginas internas dedicadas para cada card importante del Dashboard (Top 10, Subiendo, Bajando, Alto Potencial, En Riesgo) y se agregaran animaciones hover a las KPI cards superiores. Cada pagina seguira el mismo patron de layout que ComparativasPage.

## Cambios

### 1. Animaciones hover en SalesKPICards

Actualizar `SalesKPICards.tsx` para que **todas** las cards tengan animaciones hover (scale 1.03, shadow, cursor pointer) y naveguen a sus paginas internas correspondientes. Agregar tambien la info de "Anterior: $X" debajo del cambio porcentual, y "X activas" / "crecimiento positivo" / "necesitan atencion" como subtexto descriptivo debajo del valor, tal como se ve en la imagen de referencia (image-48).

Estructura visual por card (basada en la imagen):
- **Ingresos Total**: valor grande en primary, "+X.X% vs anterior", barra de progreso, "Anterior: $X"
- **Net Earnings**: igual pero en success
- **Creadoras**: valor + "X activas"
- **Subiendo**: valor + "crecimiento positivo" + "Filtro activo" (clickable, navega a /sales-overview/subiendo)
- **En Riesgo**: valor + "necesitan atencion" + "Clic para filtrar" (clickable, navega a /sales-overview/en-riesgo)

Todas con `hover:scale-[1.03] hover:shadow-lg cursor-pointer transition-all duration-200`.

### 2. Navegacion en SalesOperationalCards

Actualizar las cards operacionales para que naveguen a sus paginas internas:
- Top 10 -> `/sales-overview/top10`
- Subiendo -> `/sales-overview/subiendo`
- Bajando -> `/sales-overview/bajando`
- Alto Potencial -> `/sales-overview/alto-potencial`
- En Riesgo -> `/sales-overview/en-riesgo`
- Las demas (Alertas, Calendario, Clari AI, Todas) mantienen su comportamiento actual

### 3. Pagina Top 10 (`/sales-overview/top10`)

Basada en image-45:
- **Header**: Breadcrumb "Creator Sales > Top 10", titulo "Top 10" con subtitulo "Mejores performers", filtros de periodo
- **Podio visual**: 3 cards en fila (2do, 1ro, 3ro) con el 1ro mas grande y elevado al centro. Cada card muestra:
  - Badge de posicion (numero en circulo naranja)
  - Avatar circular con iniciales
  - Nombre artistico
  - Monto en formato $XK
  - Indicador de redes sociales (iconos pequenos)
- **Card de Concentracion**: barra inferior mostrando "Concentracion del Top 10: X%" con monto "$X de $Y" y "del ingreso total"
- **Tabla restante**: posiciones 4-10 con avatar, nombre, earnings, cambio %

### 4. Pagina Subiendo (`/sales-overview/subiendo`)

Basada en image-46:
- **Header**: Breadcrumb "Creator Sales > Subiendo", titulo "Subiendo" con subtitulo "Crecimiento positivo", filtros
- **3 KPI cards**:
  - Creadoras subiendo: conteo con icono TrendingUp en verde
  - Crecimiento promedio: porcentaje con icono Zap en azul
  - Momentum (2+ meses): conteo con icono Flame en naranja
- **Tabla**: titulo "Ordenadas por mayor crecimiento", columnas: Creadora (avatar + nombre), Crecimiento %, Earnings actual, Earnings anterior
- **Empty state**: "No hay creadoras con tendencia al alza en este periodo"

### 5. Pagina Bajando (`/sales-overview/bajando`)

Basada en image-47:
- **Header**: Breadcrumb "Creator Sales > Bajando", titulo "Bajando" con subtitulo "Necesitan atencion", filtros
- **3 KPI cards**:
  - Creadoras bajando: conteo con icono TrendingDown en rojo
  - Perdida total: monto negativo con icono DollarSign en naranja
  - Impacto vs ingreso total: porcentaje con icono AlertTriangle en amarillo
- **Tabla**: titulo "Analisis por severidad de caida", columnas: Creadora, Severidad (badge critica/moderada/leve), Earnings actual, Perdida, Variacion %
- **Empty state**: "No hay creadoras con tendencia a la baja en este periodo"

### 6. Pagina Alto Potencial (`/sales-overview/alto-potencial`)

Estructura similar a Subiendo pero con enfasis en crecimiento mayor a 30%:
- **Header**: Breadcrumb "Creator Sales > Alto Potencial", titulo "Alto Potencial" con subtitulo "Crecimiento excepcional"
- **3 KPI cards**: Creadoras alto potencial, Crecimiento promedio, Revenue generado
- **Tabla**: ordenada por mayor crecimiento, mismas columnas que Subiendo
- **Empty state**: "No hay creadoras con alto potencial en este periodo"

### 7. Pagina En Riesgo (`/sales-overview/en-riesgo`)

Estructura similar a Bajando pero mas severa (caida mayor a 20%):
- **Header**: Breadcrumb "Creator Sales > En Riesgo", titulo "En Riesgo" con subtitulo "Requieren accion inmediata"
- **3 KPI cards**: Creadoras en riesgo, Perdida total, Impacto vs ingreso total
- **Tabla**: "Analisis por severidad de riesgo", columnas: Creadora, Severidad, Earnings actual, Perdida, Variacion %
- **Empty state**: "No hay creadoras en riesgo en este periodo"

### 8. Rutas en App.tsx

Agregar 5 nuevas rutas:
```text
/sales-overview/top10
/sales-overview/subiendo
/sales-overview/bajando
/sales-overview/alto-potencial
/sales-overview/en-riesgo
```

## Archivos a crear

- `src/pages/sales-overview/Top10Page.tsx` -- pagina completa con podio y tabla
- `src/pages/sales-overview/SubiendoPage.tsx` -- pagina con KPIs y tabla de crecimiento
- `src/pages/sales-overview/BajandoPage.tsx` -- pagina con KPIs y tabla de caida
- `src/pages/sales-overview/AltoPotencialPage.tsx` -- pagina con KPIs y tabla
- `src/pages/sales-overview/EnRiesgoPage.tsx` -- pagina con KPIs y tabla

## Archivos a modificar

- `src/pages/sales-overview/SalesKPICards.tsx` -- animaciones hover en todas las cards, navegacion, subtextos descriptivos
- `src/pages/sales-overview/SalesOperationalCards.tsx` -- navegacion a paginas internas para top10, subiendo, bajando, alto_potencial, at_risk
- `src/App.tsx` -- agregar 5 nuevas rutas

## Detalles tecnicos

- Cada pagina reutiliza el layout SidebarProvider + DashboardSidebar + DashboardTopbar
- Los datos se obtienen del hook `useEarningsData` y `usePeriodComparison` existentes
- El podio de Top 10 usa un layout flex con la card central mas alta (py-8 vs py-4) y con fondo destacado (bg gradient sutil)
- Los badges de severidad en Bajando/En Riesgo se calculan: critica (caida mayor 50%), moderada (20-50%), leve (menor 20%)
- Los filtros de periodo reutilizan el mismo patron de ComparativasHeader
- Todas las tablas implementan sticky header y empty states

