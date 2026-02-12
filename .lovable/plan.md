

# Header fijo, reordenar columnas de earnings y mejorar Custom Metrics

## 1. Header fijo con scroll en el body

Actualmente la tabla ya tiene `sticky top-0` en el `TableHeader`, pero el contenedor usa `overflow-auto max-h-[calc(100vh-24rem)]` directamente en el `div` que envuelve el `Table`. Esto funciona para scroll vertical pero el header necesita mantenerse fijo de forma mas robusta. Se verificara que el patron actual es correcto y se ajustara si es necesario.

## 2. Reordenar columnas: Total Earnings, Gross Earnings, Net Earnings juntas

En `ALL_COLUMNS` dentro de `types.ts`, mover `net_earnings` para que quede inmediatamente despues de `total_earnings_gross`. Tambien renombrar para mayor claridad:
- `total_earnings_gross` -> "Gross Earnings" (ya existe, renombrar label)
- `net_earnings` -> "Net Earnings" (mover de posicion 20 a posicion 5, justo despues de gross)

Nuevo orden de las primeras columnas:
1. Artistic Name
2. Creator OF
3. Fecha
4. Hora
5. **Total Earnings** (total_earnings_gross - se mantiene como "Total Earnings")
6. **Net Earnings** (net_earnings - movida aqui)
7. Subscriptions
8. Message
9. Tips
10. ...resto de columnas...
11. Variacion, Tendencia, Participacion (al final)

## 3. Custom Metrics: cambiar de Popover a Dialog (modal)

Convertir el componente `CustomMetrics` de un `Popover` a un `Dialog` (modal) con:
- Titulo "Configurar columnas"
- Lista de todas las columnas con checkboxes para mostrar/ocultar
- Boton de cerrar
- Scroll interno si hay muchas columnas
- Texto del boton cambia a "Configurar tabla"

## Archivos a modificar

### `src/pages/sales-performance/types.ts`
- Reordenar `ALL_COLUMNS`: mover `net_earnings` justo despues de `total_earnings_gross`

### `src/pages/sales-performance/CustomMetrics.tsx`
- Cambiar de `Popover` a `Dialog` (modal)
- Agregar titulo "Configurar columnas"
- Cambiar texto del boton a "Configurar tabla"

### `src/pages/sales-performance/EarningsTable.tsx`
- Verificar que el sticky header funciona correctamente (ya implementado)

