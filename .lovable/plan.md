

## Agregar Fechas y Timeline Semanal al Roadmap

### Descripcion

Transformar cada seccion colapsable del roadmap en una tabla con columnas adicionales: **Submodule**, **Task**, **Status**, **Delivery** (fecha estimada de entrega), y un **timeline semanal** (W1-W8) que muestra barras de progreso visuales indicando cuando se completo cada tarea o cuando esta programada.

---

### Cambios necesarios

### 1. Nueva columna en base de datos

Agregar un campo `completed_at` a la tabla `roadmap_items` para registrar automaticamente cuando un item se marca como "done". Esto permite saber la fecha real de completado, no solo `updated_at` que cambia con cualquier edicion.

### 2. Mutation `updateItemStatus` actualizada

Cuando el status cambia a "done", se envia `completed_at: new Date().toISOString()`. Si cambia de "done" a otro estado, se envia `completed_at: null`.

### 3. Mutation `updateDeliveryDate` nueva

Nuevo mutation en `useRoadmap.ts` que permite actualizar la `delivery_date` de un item haciendo click en la celda de Delivery y seleccionando una fecha con un popover de calendario.

### 4. Rediseno visual de las secciones colapsables

Cada seccion colapsable pasa de ser una lista simple a una **tabla** con las siguientes columnas:

| Check | Submodule | Task | Status | Delivery | W1 (Feb 17) | W2 (Feb 24) | ... | W8 (Abr 7) |
|-------|-----------|------|--------|----------|-------------|-------------|-----|------------|

- **Check**: Checkbox existente
- **Submodule**: Badge gris con el nombre del submodulo (ya existe)
- **Task**: Texto de la tarea con line-through si esta done
- **Status**: Badge clickable con ciclo de estados (ya existe)
- **Delivery**: Fecha de entrega, clickable para editar con popover de calendario. Formato `MMM d` (ej: "Feb 24")
- **W1-W8**: Columnas semanales que muestran barras de color verde (done) o ambar (in_progress) en las semanas correspondientes, calculadas a partir de `created_at`, `delivery_date` y `completed_at`

### 5. Logica del timeline semanal

- Se calculan 8 semanas desde la fecha mas temprana encontrada en los items (o fecha actual si no hay datos)
- Cada semana se muestra como columna con header "W1", "W2", etc. y subfecha "Feb 17", "Feb 24"
- Para items "done": barra verde desde la semana de `created_at` hasta la semana de `completed_at`
- Para items "in_progress": barra ambar desde la semana de inicio hasta la semana actual
- Para items "todo" con `delivery_date`: indicador gris en la semana de delivery
- Scroll horizontal si las columnas exceden el ancho disponible

---

### Seccion tecnica

**Archivo:** Migracion SQL nueva
- `ALTER TABLE roadmap_items ADD COLUMN completed_at timestamptz;`
- Update items existentes con status "done": `SET completed_at = updated_at WHERE status = 'done'`

**Archivo:** `src/pages/roadmap/useRoadmap.ts`
- Agregar `completed_at` al tipo `RoadmapItem`
- Modificar `updateItemStatus` para enviar `completed_at` segun el nuevo status
- Agregar mutation `updateDeliveryDate({ id, delivery_date })`

**Archivo:** `src/pages/roadmap/RoadmapContent.tsx`
- Reemplazar las filas simples (div flex) por una estructura tipo tabla con header fijo
- Header de tabla: Check, Submodule, Task, Status, Delivery, W1..W8
- Agregar logica `useMemo` para calcular las 8 semanas y mapear cada item a las celdas correspondientes
- Agregar componente Popover + Calendar para editar `delivery_date` inline
- Contenedor con `overflow-x-auto` para scroll horizontal en el timeline
- Las columnas de semana tendran ancho fijo (`w-12`) con barras de 4px de alto coloreadas segun status

