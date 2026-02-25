

## Plan: Edicion inline en tabla y vista ClickUp — Asignar, Prioridad, Fechas

### Objetivo

Permitir editar directamente desde las celdas de la tabla (`TasksTable`) y la vista ClickUp (`TaskListRow`) las siguientes propiedades sin abrir el modal completo de edicion:

1. **Asignados** — Popover con checkboxes multi-select para agregar/quitar asignados
2. **Prioridad** — DropdownMenu para cambiar prioridad con un clic
3. **Fechas (inicio y limite)** — Popover con calendario + selector de hora

### Cambios en el hook

**`useTareas.ts`** — Agregar 2 mutaciones ligeras:

- `patchTask(taskId, fields)`: actualiza columnas parciales directamente (`priority`, `start_at`, `due_at`, etc.) sin requerir todos los campos como `updateTask`
- `updateTaskAssignees(taskId, assigneeIds[])`: sincroniza la junction table `task_assignees` y actualiza `assigned_to` con el primer asignado. Envia notificaciones a nuevos asignados

### Componentes inline nuevos

Se crearan 3 componentes reutilizables en `src/pages/tareas/`:

#### `InlineAssigneeSelect.tsx`
- Trigger: celda actual de asignados (nombres o "Sin asignar")
- Popover con lista de perfiles del proyecto, cada uno con checkbox
- Al marcar/desmarcar, llama `updateTaskAssignees` inmediatamente
- Muestra avatares/nombres resumidos como trigger

#### `InlinePrioritySelect.tsx`
- Trigger: Badge de prioridad actual
- DropdownMenu con las 4 opciones (Baja, Media, Alta, Urgente) usando los mismos iconos y colores de `priorityConfig`
- Al seleccionar, llama `patchTask(taskId, { priority: newValue })`

#### `InlineDateTimeEdit.tsx`
- Trigger: texto de fecha actual (o "—" si no hay fecha)
- Popover controlado con Calendar + Select de hora (usando `TIME_OPTIONS`)
- Parametro `field` para indicar si edita `start_at` o `due_at`
- Al seleccionar fecha+hora, llama `patchTask(taskId, { [field]: isoString })`
- Calendario se cierra al confirmar

### Integracion en vistas existentes

#### `TasksTable.tsx`
- Celda "Asignado": reemplazar texto estatico con `<InlineAssigneeSelect>`
- Celda "Prioridad": reemplazar Badge estatico con `<InlinePrioritySelect>`
- Celda "Inicio": reemplazar texto estatico con `<InlineDateTimeEdit field="start_at">`
- Celda "Countdown": mantener countdown como display, pero agregar `<InlineDateTimeEdit field="due_at">` al hacer clic en la fecha
- Nuevas props: `onPatchTask`, `onUpdateAssignees`

#### `TaskListRow.tsx`
- Columna "Asignado": reemplazar con `<InlineAssigneeSelect>`
- Columna "Prioridad": reemplazar con `<InlinePrioritySelect>`
- Columna "Fecha limite": reemplazar con `<InlineDateTimeEdit>`
- Mismas nuevas props

#### `TareasContent.tsx`
- Pasar `patchTask` y `updateTaskAssignees` como props a `TasksTable`, `TaskListView` y luego a `TaskListRow`

#### `TaskListView.tsx`
- Propagar las nuevas props hacia cada `TaskListRow`

### Interface de props actualizada

```text
TasksTableProps / TaskListRowProps:
  + onPatchTask: (taskId: string, fields: Record<string, any>) => void
  + onUpdateAssignees: (taskId: string, assigneeIds: string[]) => void
```

### Archivos

| Archivo | Accion |
|---------|--------|
| `src/pages/tareas/useTareas.ts` | Agregar `patchTask` y `updateTaskAssignees` mutations |
| `src/pages/tareas/InlineAssigneeSelect.tsx` | Nuevo componente |
| `src/pages/tareas/InlinePrioritySelect.tsx` | Nuevo componente |
| `src/pages/tareas/InlineDateTimeEdit.tsx` | Nuevo componente |
| `src/pages/tareas/TasksTable.tsx` | Integrar los 3 componentes inline |
| `src/pages/tareas/TaskListRow.tsx` | Integrar los 3 componentes inline |
| `src/pages/tareas/TaskListView.tsx` | Propagar nuevas props |
| `src/pages/tareas/TareasContent.tsx` | Conectar nuevas mutations como props |

