

# Modo Comparacion en Sales Dashboard

## Resumen
Agregar un boton "Comparar" en los filtros del Sales Dashboard que active un modo de comparacion. Al activarse, aparecera un segundo selector de fechas (Periodo B) usando el componente `DateRangePicker` existente. Todas las secciones del dashboard (EarningsSummary, EarningsTrendChart, CreatorStatsCards, ConcentrationChart, CreatorsTable) mostraran los datos de ambos periodos lado a lado con indicadores de variacion porcentual.

## Flujo del usuario

```text
Estado normal:
[Vista General] [Rendimiento]
[Ayer] [Hoy] [Esta semana] [Este mes]   01 feb - 12 feb   [Comparar]

Al activar "Comparar":
[Vista General] [Rendimiento]
[Ayer] [Hoy] [Esta semana] [Este mes]   01 feb - 12 feb   [X Cerrar]
                    vs   [DateRangePicker: Periodo B]
```

## Cambios por archivo

### 1. Modificar `DashboardFilters.tsx`
- Agregar prop `compareMode: boolean` y `onToggleCompare`
- Agregar props `compareDateFrom`, `compareDateTo`, `onCompareDateChange`
- Mostrar boton "Comparar" que activa el modo
- Al activar, renderizar un segundo `DateRangePicker` para el Periodo B
- Mostrar etiquetas "Periodo A" y "Periodo B" para claridad

### 2. Modificar `SalesDashboard.tsx`
- Agregar estado `compareMode: boolean` y `compareRange: { from, to }`
- Calcular `comparedRows` filtrando `allRows` por el rango B
- Pasar `comparedRows` a todos los componentes hijos cuando `compareMode` es true

### 3. Modificar `EarningsSummary.tsx`
- Agregar prop opcional `comparedRows?: EarningsRow[]`
- Cuando existe, mostrar debajo de cada valor la variacion: valor del periodo B y el cambio porcentual (verde si positivo, rojo si negativo)
- Layout: valor principal arriba, valor comparado y % debajo en texto mas pequeno

### 4. Modificar `EarningsTrendChart.tsx`
- Agregar prop opcional `comparedRows?: EarningsRow[]`
- Cuando existe, mostrar dos series de barras superpuestas: Periodo A (color primario) y Periodo B (color gris/muted)
- Alinear por dia relativo (Dia 1, Dia 2, ...) ya que los periodos pueden tener fechas distintas
- Agregar leyenda indicando Periodo A y Periodo B

### 5. Modificar `CreatorStatsCards.tsx`
- Agregar prop opcional `comparedRows?: EarningsRow[]`
- Mostrar el valor del periodo A, y debajo el valor del periodo B con la variacion porcentual

### 6. Modificar `ConcentrationChart.tsx`
- Agregar prop opcional `comparedRows?: EarningsRow[]`
- Cuando existe, superponer la curva de Lorenz del Periodo B en color secundario sobre la del Periodo A
- Agregar leyenda con ambos periodos

### 7. Modificar `CreatorsTable.tsx`
- Agregar prop opcional `comparedRows?: EarningsRow[]`
- Agregar columnas adicionales: "Gross B", "Net B", "Variacion %"
- La variacion se calcula por creadora comparando earnings del periodo A vs B
- Colorear la variacion en verde (positiva) o rojo (negativa)

## Detalles tecnicos

- El `DateRangePicker` del Periodo B reutiliza el componente existente en `src/components/ui/date-range-picker.tsx`
- Los calculos de variacion: `((valorA - valorB) / valorB) * 100`
- Si valorB es 0, mostrar "Nuevo" en lugar de porcentaje infinito
- El modo comparacion se desactiva con un boton X que limpia el estado

## Archivos a modificar
- `src/pages/sales-dashboard/DashboardFilters.tsx` - agregar UI de comparacion
- `src/pages/SalesDashboard.tsx` - estado y logica de comparacion
- `src/pages/sales-dashboard/EarningsSummary.tsx` - mostrar comparacion
- `src/pages/sales-dashboard/EarningsTrendChart.tsx` - doble serie en grafico
- `src/pages/sales-dashboard/CreatorStatsCards.tsx` - mostrar comparacion
- `src/pages/sales-dashboard/ConcentrationChart.tsx` - doble curva
- `src/pages/sales-dashboard/CreatorsTable.tsx` - columnas comparativas

