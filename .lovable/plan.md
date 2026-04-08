

# Plan: Corregir filtros Top 20% y Bottom 80% en Análisis de Concentración

## Problema

Los filtros "Top 20%" y "Bottom 80%" simplemente cortan los puntos de la curva de Lorenz, pero esos puntos tienen valores **acumulados** del dataset completo. El resultado es que:
- Los labels del eje X no empiezan en 0% para el segmento filtrado
- Los valores de revenue son acumulados del total, no del segmento
- El insight no cambia según el filtro activo
- No hay información útil sobre el segmento (cuántas creadoras, cuánto generan)

## Solución

Reescribir `buildLorenz` para que retorne también los datos agrupados por creadora (sorted), y construir curvas de Lorenz **independientes** para cada segmento:

### Cambios en `ConcentrationChart.tsx`

1. **`buildLorenz` retorna datos crudos además de la curva**: Devolver el array `sorted` (ingresos por creadora ordenados desc) y el `total` para poder recalcular segmentos.

2. **Nuevas funciones de segmentación**:
   - `buildSegmentCurve(sorted, "top20")`: toma el top 20% de creadoras, construye una curva de Lorenz **interna** al segmento (eje X = % dentro del segmento, eje Y = % del revenue del segmento)
   - `buildSegmentCurve(sorted, "bottom80")`: igual para el 80% inferior

3. **Insight dinámico según filtro**:
   - **All**: "El 20% de las creadoras genera el X% de los ingresos"
   - **Top 20%**: "N creadoras (top 20%) generan $X total — la #1 aporta Y% del segmento"
   - **Bottom 80%**: "N creadoras (bottom 80%) generan $X total — distribución más uniforme"

4. **KPI cards del segmento**: Mostrar debajo del insight: cantidad de creadoras en el segmento, revenue total del segmento, y % que representan del total.

## Archivo modificado
| Archivo | Cambio |
|---------|--------|
| `ConcentrationChart.tsx` | Reescribir lógica de filtros para generar curvas independientes por segmento, insight dinámico, KPIs de segmento |

