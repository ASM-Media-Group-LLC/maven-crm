
# Corregir modal de configurar tabla, header fijo y agregar columna Gross Earnings

## Problemas a resolver

1. **CustomMetrics usa Dialog (modal centrado)**: Debe ser un Popover que aparezca justo debajo del boton "Configurar tabla", no un modal centrado en pantalla
2. **Header de tabla no queda fijo**: El contenedor actual tiene `overflow-auto` con `max-h`, pero el toolbar (search + botones) esta fuera del contenedor de scroll, lo cual esta bien. El `TableHeader` tiene `sticky top-0` pero necesita verificarse que funcione correctamente dentro del contenedor
3. **Falta columna Gross Earnings**: Actualmente solo hay "Total Earnings" (`total_earnings_gross`) y "Net Earnings". Se necesita agregar "Gross Earnings" como columna separada

## Cambios por archivo

### 1. `src/pages/sales-performance/CustomMetrics.tsx`
- Revertir de `Dialog` a `Popover` (de `@/components/ui/popover`)
- Usar `PopoverContent` con `align="end"` para que aparezca debajo del boton, alineado a la derecha
- Mantener el titulo "Configurar columnas" dentro del popover como un encabezado pequeno
- Mantener la lista de checkboxes con scroll interno (`max-h-80 overflow-y-auto`)
- El texto del boton se mantiene como "Configurar tabla"

### 2. `src/pages/sales-performance/types.ts`
- Renombrar `total_earnings_gross` label de "Total Earnings" a "Gross Earnings"
- Agregar nueva columna calculada "Total Earnings" que represente el total (se puede mapear al mismo campo o ser un campo calculado si hay diferencia semantica)

Nuevo orden de las columnas de earnings:
1. **Gross Earnings** (`total_earnings_gross`)
2. **Net Earnings** (`net_earnings`)
3. **Total Earnings** (nueva entrada, campo calculado = gross + net o simplemente gross como total)

Dado que en la data real `total_earnings_gross` ya representa el gross, y `net_earnings` es el 80% de ese valor, la logica seria:
- Gross Earnings = `total_earnings_gross` (datos crudos de la BD)
- Net Earnings = `net_earnings` (calculado como gross * 0.80)
- Total Earnings = se puede interpretar como la suma o como el gross mismo

Para evitar ambiguedad, se agregara un campo `gross_earnings` como alias visual del mismo `total_earnings_gross`, y "Total Earnings" se mantendra como la columna existente.

Orden final:
1. Artistic Name
2. Creator OF  
3. Fecha
4. Hora
5. **Gross Earnings** (total_earnings_gross)
6. **Net Earnings** (net_earnings)  
7. **Total Earnings** (nueva columna -- por ahora igual a gross, se puede ajustar despues si el calculo difiere)
8. Subscriptions, Message, Tips, etc.

### 3. `src/pages/sales-performance/EarningsTable.tsx`
- Verificar que el sticky header funciona: el `div` contenedor tiene `overflow-auto max-h-[calc(100vh-24rem)]` y el `TableHeader` tiene `sticky top-0 z-10 bg-card`. Este patron es correcto. Se asegurara que no haya ningun problema de apilamiento (z-index)

### 4. `src/pages/sales-dashboard/SalesReportSection.tsx`
- Agregar calculo de `total_earnings` en el `enriched` map (linea 55-71) si se necesita un campo separado

## Archivos a modificar
- `src/pages/sales-performance/CustomMetrics.tsx`
- `src/pages/sales-performance/types.ts`
- `src/pages/sales-dashboard/SalesReportSection.tsx` (agregar campo total_earnings si es necesario)
