

## Mejorar Sales Overview: Graficas + Accesos Directos

### Problema actual

La pagina `/sales-overview` solo muestra tarjetas KPI y tarjetas operacionales. No tiene ningun grafico visual que permita ver tendencias de un vistazo. Ademas, no hay acceso claro y directo a "Reporte de Ventas" (`/salesdashboard`) ni a "IA Ventas" (`/aisales`) desde esta vista.

---

### Cambios propuestos

#### 1. Header con accesos directos

Agregar dos botones prominentes en el header junto al titulo:
- **Reporte de Ventas** (icono FileBarChart, variante outline) - navega a `/salesdashboard`
- **IA Ventas** (icono Bot/Sparkles, variante outline con gradiente accent) - navega a `/aisales`

Esto reemplaza la tarjeta "Sales Report" de las operational cards (redundante) y da acceso inmediato.

#### 2. Grafico de tendencia de ganancias (nuevo)

Debajo de los KPI cards, agregar un grafico de barras de tendencia diaria (reutilizando el patron de `EarningsTrendChart`) filtrado al rango de fechas seleccionado. Muestra las ganancias brutas dia a dia con barras de color primary.

#### 3. Grafico de ganancias por canal (nuevo)

Al lado o debajo del grafico de tendencia, agregar un grafico de lineas por canal (Subscriptions, Tips, Messages, Other) siguiendo el patron de `EarningsByChannelChart`. Permite ver que canales impulsan el revenue.

#### 4. Mini tabla Top 5 creadoras

Debajo de los graficos, una tabla compacta con las 5 creadoras top del periodo: nombre, earnings brutos, variacion porcentual y badge de tendencia. Con un boton "Ver todas" que lleva a `/sales-overview/top10`.

#### 5. Layout reorganizado

El orden de la pagina sera:

```text
+------------------------------------------+
| Header: Titulo + [Reporte] [IA Ventas]   |
+------------------------------------------+
| DateRangePicker                          |
+------------------------------------------+
| KPI Cards (5 tarjetas)                   |
+------------------------------------------+
| Tendencia Diaria  |  Ganancias por Canal |
| (BarChart)        |  (LineChart)         |
+------------------------------------------+
| Top 5 Creadoras (mini tabla)             |
+------------------------------------------+
| Operational Cards (5, sin "Sales Report")|
+------------------------------------------+
```

---

### Detalle tecnico

#### `SalesOverviewHeader.tsx`

- Agregar props `onNavigateReport` y `onNavigateAi` (o usar `useNavigate` internamente)
- Renderizar dos botones: `<Button variant="outline">` con iconos `FileBarChart` y `Sparkles`

#### `SalesOverview.tsx`

- Calcular `filteredRows` (filas del periodo seleccionado) para pasar a los graficos
- Importar y renderizar `EarningsTrendChart` y `EarningsByChannelChart` en grid `grid-cols-1 xl:grid-cols-2`
- Crear componente inline o separado `TopCreatorsTable` con las top 5 del `comparison.top10`

#### `SalesOperationalCards.tsx`

- Eliminar la tarjeta "Sales Report" (ya esta en el header)
- Quedan 5 tarjetas operacionales: Comparativas, Top 10, Bajando, Alto Potencial, Alertas

---

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/sales-overview/SalesOverviewHeader.tsx` | Agregar botones de navegacion a Reporte e IA Ventas |
| `src/pages/SalesOverview.tsx` | Agregar filteredRows, importar graficos, agregar mini tabla Top 5 |
| `src/pages/sales-overview/SalesOperationalCards.tsx` | Eliminar tarjeta "Sales Report" (ahora esta en el header) |

Sin cambios en DB ni rutas.

