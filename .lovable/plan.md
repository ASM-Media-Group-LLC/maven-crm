

# Mover Análisis de Concentración debajo de Tendencia de Ganancias

## Cambio

Reordenar los componentes en la Vista General de `SalesDashboard.tsx` para que `ConcentrationChart` aparezca inmediatamente después de `EarningsTrendChart`.

### Orden actual
1. EarningsSummary
2. EarningsTrendChart
3. CreatorStatsCards
4. ConcentrationChart
5. SalesReportSection

### Nuevo orden
1. EarningsSummary
2. EarningsTrendChart
3. **ConcentrationChart** (movido aquí)
4. CreatorStatsCards
5. SalesReportSection

## Archivo a modificar
- `src/pages/SalesDashboard.tsx` -- intercambiar las líneas de `CreatorStatsCards` y `ConcentrationChart`
