

## Plan: Ajustes en Promolog — scroll, KPIs, columnas y limpieza

### Problemas identificados

1. **"Pendiente LG"**: Ya no existe en el código. Fue eliminado en cambios anteriores. No se requiere acción.
2. **Scroll de tabla no es interno**: El contenedor de la tabla (`div.flex-1.min-h-0.overflow-auto`) envuelve tanto el `DataTableShell` como el scroll, pero el `DataTableShell` ya tiene su propio scroll interno. El div padre con `overflow-auto` causa doble scroll. Se debe quitar el `overflow-auto` del padre y dejar que `DataTableShell` con `className="flex-1 min-h-0"` maneje todo.
3. **KPI "Total Promos" falta**: Las 4 cards actuales son: Modelos, Ingresados, Sin revisar, Completadas. Falta una card de "Total Promos" (conteo total de entries filtradas). Se reemplaza "Modelos" (que no es relevante aquí) por "Total Promos".
4. **Columna "Creación" debe ir primero**: Actualmente el orden es Ticket → Modelo → Red → Plataforma → Resultado → Agente → Creación → Acciones. Se debe mover "Creación" a la primera posición.
5. **Columna "Ticket"**: El `ticket_number` es un campo de la base de datos que identifica cada entry. Si no se usa en tu flujo operativo, se puede eliminar de la tabla. Se reemplaza por el # (número de fila) para mantener consistencia con el design system.

### Cambios

#### 1. `PromologTable.tsx` — reordenar columnas y eliminar Ticket
Nuevo orden de columnas:
- **#** (índice de fila, no ticket_number)
- **Creación** (fecha + hora)
- **Modelo** (nombre + handle)
- **Red Social**
- **Plataforma**
- **Resultado**
- **Agente**
- **Acciones**

Eliminar la columna "Ticket" y el sort key asociado. Corregir el bug de `<TableHead>` anidado en la línea 126 (hay un `<TableHead>` dentro de otro `<TableHead>`).

#### 2. `PromologContent.tsx` — corregir scroll y KPIs

**Scroll**: En línea 563, cambiar el contenedor de:
```
<div className="flex-1 min-h-0 overflow-auto px-6 pb-4">
```
a:
```
<div className="flex-1 min-h-0 px-6 pb-4 flex flex-col">
```
Y pasar `className="flex-1 min-h-0"` al `DataTableShell` para que el scroll sea interno con footer fijo.

**KPIs**: Reemplazar la card "Modelos" (creators.length) por "Total Promos" (filteredEntries.length o entries.length) que es más relevante para esta vista.

### Archivos a modificar
- `src/pages/promolog/PromologTable.tsx` — reordenar columnas, quitar Ticket, corregir TableHead anidado
- `src/pages/promolog/PromologContent.tsx` — scroll interno con footer fijo, ajustar KPI cards

