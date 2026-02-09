
# Agregar columna "Hora" (HH:MM) junto a Fecha

## Resumen
Agregar una columna "Hora" que muestre la hora del reporte en formato HH:MM (24 horas), posicionada justo despues de la columna "Fecha". La hora se extrae del campo `date` existente que ya contiene timestamp completo.

## Cambios

### 1. `src/pages/sales-performance/types.ts`
- Agregar campo `report_time: string | null` a la interfaz `EarningsRow`
- Agregar formato `"time"` al tipo union de `ColumnDef.format`
- Insertar nueva columna en `ALL_COLUMNS` justo despues de "Fecha":
  ```
  { key: "report_time", label: "Hora", defaultVisible: true, align: "right", format: "time" }
  ```

### 2. `src/pages/sales-performance/useEarningsData.ts`
- En el `.map()` final donde se construye cada `EarningsRow`, computar `report_time` extrayendo HH:MM del campo `date`:
  ```typescript
  report_time: e.date ? new Date(e.date).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false }) : null
  ```

### 3. `src/pages/sales-performance/EarningsTable.tsx`
- Agregar case `"time"` en la funcion `formatCell` que simplemente retorna el string tal cual (ya viene formateado desde el hook)

## Resultado
La tabla mostrara: ... | Fecha | Hora | Total Earnings | ...
Donde "Fecha" muestra "ene 15, 2025" y "Hora" muestra "14:30". La columna es sortable y visible por defecto, y se puede ocultar/mostrar desde Custom Metrics.
