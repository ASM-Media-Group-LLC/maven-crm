
# Deduplicar registros: un registro por creador por dia

## Problema actual

La tabla muestra multiples registros por creador por dia (snapshots cada hora). Por ejemplo, Franundurraga tiene registros a las 00:31, 01:00, 02:00, 08:00 del 10 feb 2026.

## Reglas de negocio

1. Registros con hora entre 00:00 y 00:55 pertenecen al dia anterior (ej: 10 feb 00:31 = earnings del 9 feb)
2. Solo un registro por creador por dia efectivo: el mas reciente
3. Para el dia actual (aun no terminado), mostrar el registro mas nuevo disponible

## Detalle tecnico

### Archivo: `src/pages/sales-performance/useEarningsData.ts`

Agregar una funcion de deduplicacion despues de mapear los earnings. La logica:

1. Para cada registro, calcular la "fecha efectiva":
   - Extraer hora y minuto del campo `date`
   - Si hora es 0 y minuto es <= 55, restar un dia a la fecha
   - Guardar esta fecha efectiva en un nuevo campo `effective_date`

2. Agrupar registros por clave compuesta: `creator_id || pending_creator` + `effective_date`

3. De cada grupo, quedarse solo con el registro que tenga el `date` original mas reciente

4. Reemplazar el campo `date` visible con `effective_date` para que la tabla muestre la fecha corregida

### Archivo: `src/pages/sales-performance/types.ts`

Agregar campo `effective_date: string` al tipo `EarningsRow` para almacenar la fecha corregida.

### Cambios en columnas y formato

La columna "Fecha" mostrara la fecha efectiva (corregida). La columna "Hora" seguira mostrando la hora real del registro original. No se eliminan columnas.

### Impacto en filtros de fecha

Los filtros de fecha (`dateFrom`, `dateTo`) en `SalesPerformanceCreator.tsx` deben comparar contra `effective_date` en lugar de `date` para ser consistentes con la fecha mostrada.

### Ejemplo con Franundurraga (10 feb 2026)

Registros originales:
- 10 feb 00:31 -> effective_date = 9 feb (pertenece al dia anterior)
- 10 feb 01:00 -> effective_date = 10 feb (hora > 00:55, dia normal)
- 10 feb 02:00 -> effective_date = 10 feb
- 10 feb 08:00 -> effective_date = 10 feb

Resultado despues de deduplicar:
- 9 feb: registro de 10 feb 00:31 (unico registro del 9 feb en ese rango)
- 10 feb: registro de 10 feb 08:00 (el mas reciente del dia)

### Resumen de archivos modificados

- `src/pages/sales-performance/types.ts` - agregar `effective_date`
- `src/pages/sales-performance/useEarningsData.ts` - logica de fecha efectiva y deduplicacion
- `src/pages/SalesPerformanceCreator.tsx` - filtros de fecha usan `effective_date`
- `src/pages/sales-performance/EarningsTable.tsx` - columna Fecha muestra `effective_date`
