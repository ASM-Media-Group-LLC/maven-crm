

# Agregar columnas faltantes y eliminar duplicados en Sales Dashboard

## Analisis de duplicados

Actualmente en la Vista General hay 3 secciones mostrando datos repetidos:

1. **EarningsSummary** (arriba): Total Earnings, Subscriptions, Messages, Tips, Posts, Referrals, Streams
2. **CreatorStatsCards** (medio): Creators, Message Earnings, Total Earnings, Refunds
3. **EarningsSummaryCards** (dentro de SalesReportSection): Creators, Total Earnings, Subscriptions, Messages, Tips

"Total Earnings" aparece en las 3 secciones. "Creators" aparece en 2. "Messages" aparece en 2. "Subscriptions" y "Tips" aparecen en 2.

**Accion**: Eliminar `EarningsSummaryCards` de dentro del `SalesReportSection`, ya que esa informacion ya se muestra arriba en `EarningsSummary` y `CreatorStatsCards`. La tabla de estadisticas no necesita sus propias tarjetas KPI duplicadas.

## Columnas nuevas a agregar

Segun la imagen de referencia, la tabla necesita estas columnas adicionales:

| Columna | Calculo | Formato |
|---------|---------|---------|
| **Gross Earnings** | Ya existe como `total_earnings_gross` | currency |
| **Net Earnings** | `total_earnings_gross * 0.80` (OF retiene 20%) | currency |
| **Variacion** | Cambio porcentual vs periodo anterior por creadora | percent con signo |
| **Tendencia** | Etiqueta basada en variacion: "Creciendo" / "Cayendo" / "Estable" | texto con icono |
| **Participacion** | `earnings_creadora / total_earnings_todas * 100` | percent |

## Cambios por archivo

### 1. Modificar `src/pages/sales-performance/types.ts`
- Agregar campos calculados al tipo `EarningsRow`: `net_earnings`, `variation_percent`, `trend`, `participation_percent`
- Agregar las nuevas columnas a `ALL_COLUMNS`:
  - `net_earnings` (Net Earnings, currency, visible por defecto)
  - `variation_percent` (Variacion, percent con signo, visible por defecto)
  - `trend` (Tendencia, texto, visible por defecto)
  - `participation_percent` (Participacion, percent, visible por defecto)

### 2. Modificar `src/pages/sales-dashboard/SalesReportSection.tsx`
- Eliminar la importacion y uso de `EarningsSummaryCards` (ya esta en la vista general arriba)
- Calcular los campos nuevos antes de pasarlos a la tabla:
  - `net_earnings = total_earnings_gross * 0.80`
  - `participation_percent = (total_earnings_gross / sum_total) * 100`
  - Para `variation_percent` y `trend`: se necesita acceso a `comparedRows` (ya esta como prop). Agrupar por creadora en ambos periodos, calcular cambio porcentual, asignar tendencia

### 3. Modificar `src/pages/sales-performance/EarningsTable.tsx`
- Agregar formateo para los nuevos tipos:
  - `variation_percent`: mostrar con signo (+713.0%) y color (verde positivo, rojo negativo)
  - `trend`: mostrar icono de tendencia (flecha arriba/abajo) con texto "Creciendo"/"Cayendo"/"Estable"
  - `participation_percent`: mostrar con barra de progreso mini o solo porcentaje

## Detalle tecnico

### Calculo de Variacion y Tendencia
Para cada fila (creadora + dia), se compara con el periodo anterior:
- Se agrupan `comparedRows` por creadora
- Se calcula el total gross del periodo anterior para esa creadora
- `variation = ((current - previous) / previous) * 100`
- Si `variation > 5` => "Creciendo", si `variation < -5` => "Cayendo", sino => "Estable"
- Si no hay `comparedRows`, variacion = null y tendencia = null

### Calculo de Participacion
- `total_all = sum(total_earnings_gross)` de todas las filas filtradas
- `participation = (row.total_earnings_gross / total_all) * 100`

### Tipo EarningsRow extendido
```typescript
// Campos calculados opcionales
net_earnings?: number | null;
variation_percent?: number | null;
trend?: string | null;
participation_percent?: number | null;
```

## Archivos a modificar
- `src/pages/sales-performance/types.ts` -- agregar campos y columnas
- `src/pages/sales-dashboard/SalesReportSection.tsx` -- calcular campos, eliminar EarningsSummaryCards
- `src/pages/sales-performance/EarningsTable.tsx` -- formatear nuevas columnas con colores e iconos

