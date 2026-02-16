

## Ciclo de vida completo para tareas + KPIs actualizados

### Problema actual

Las tareas solo manejan dos estados reales (`active` y `completed`), mientras que las subtareas ya tienen un ciclo completo (pendiente, en progreso, pausada, completada). Las tareas necesitan el mismo nivel de control: cambiar estado, asignar, fecha de inicio, fecha de fin, y que las vencidas aparezcan correctamente. Los KPIs no reflejan estos estados.

---

### Cambios en base de datos

Agregar columna `start_at` a la tabla `tasks` para fecha de inicio planificada:

```sql
ALTER TABLE tasks ADD COLUMN start_at timestamp with time zone;
```

---

### Flujo de estados para tareas

| Estado | Transiciones posibles |
|--------|----------------------|
| `active` (pendiente) | Iniciar, Completar |
| `in_progress` | Pausar, Completar |
| `paused` | Reanudar, Completar |
| `overdue` (vencida) | Justificar, luego Completar |
| `completed` | Estado final |

Se reutiliza el mismo patron de dropdown de estado que ya funciona en las subtareas.

---

### Cambios por archivo

| Archivo | Cambio |
|---------|--------|
| **Nueva migracion** | Agregar `start_at` a tabla `tasks` |
| `src/pages/tareas/useTareas.ts` | (1) Agregar `start_at` a interface Task. (2) Nueva mutacion `updateTaskStatus` para cambiar estado con timestamps. (3) Actualizar `createTask` y `updateTask` para manejar `start_at`. |
| `src/pages/tareas/TaskListView.tsx` | Agregar grupo "PAUSADAS" a las secciones colapsables. Actualizar la logica de agrupacion para manejar `in_progress` y `paused` como estados reales del campo `status` (no derivados del countdown). |
| `src/pages/tareas/TaskListRow.tsx` | Agregar dropdown de estado (igual que SubtaskItem) en lugar del boton simple de completar. Mostrar fecha de inicio junto a fecha de fin. Pasar `onStatusChange` como prop. |
| `src/pages/tareas/TaskCard.tsx` | Reemplazar botones Completar/Justificar por dropdown de estado con las mismas transiciones. Mostrar fechas inicio/fin. |
| `src/pages/tareas/TasksTable.tsx` | Reemplazar badge de estado estatico por dropdown de estado clickeable. Agregar columna de fecha inicio. |
| `src/pages/tareas/TareasContent.tsx` | (1) Actualizar KPIs: 5 cards (Pendientes, En curso, Pausadas, Vencidas, Completadas). (2) Actualizar filtro de estado con las 5 opciones. (3) Agregar `updateTaskStatus` al flujo. (4) Actualizar `getTaskStatus` para leer el campo `status` directamente en lugar de derivarlo del countdown. |
| `src/pages/tareas/CreateTaskModal.tsx` | En modo "fecha", incluir `start_at` en el payload que se envia al crear la tarea. |
| `src/pages/tareas/EditTaskModal.tsx` | Agregar campo de fecha de inicio. Agregar selector de estado. Enviar `start_at` y `status` en la actualizacion. |
| `src/pages/tareas/ProjectsListContent.tsx` | Actualizar KPIs de proyectos para mostrar desglose por estado (en curso, pausadas ademas de activas/vencidas/completadas). Actualizar `getProjectTaskCounts` en `useProjects.ts`. |
| `src/pages/tareas/useProjects.ts` | Ampliar `getProjectTaskCounts` para devolver `{ pending, in_progress, paused, overdue, completed }`. |

---

### Detalle tecnico

#### 1. Dropdown de estado en tareas (nuevo patron compartido)

Se aplica el mismo patron que ya existe en `SubtaskItem.tsx`:

```text
[Pendiente]    --> Iniciar | Completar
[En progreso]  --> Pausar | Completar
[Pausada]      --> Reanudar | Completar
[Vencida]      --> Justificar (luego Completar)
[Completada]   --> (sin menu)
```

Logica de timestamps:
- "Iniciar": status=in_progress, started_at=now() (si no existe)
- "Pausar": status=paused
- "Reanudar": status=in_progress
- "Completar": status=completed, completed_at=now()

Las tareas vencidas siguen requiriendo justificacion antes de completarse (flujo existente preservado).

#### 2. KPIs actualizados en TareasContent

De 3 cards a 5:

| KPI | Icono | Color |
|-----|-------|-------|
| Pendientes | Clock | primary |
| En curso | Play | primary |
| Pausadas | Pause | warning (yellow) |
| Vencidas | AlertTriangle | destructive |
| Completadas | CheckSquare | emerald |

La logica de conteo usara el campo `status` directamente, con una verificacion adicional de `due_at` para detectar vencidas (si `status` no es `completed` y `due_at` ya paso).

#### 3. KPIs de proyectos

Las cards de proyecto en `ProjectsListContent` mostraran el desglose ampliado: pendientes, en curso, pausadas, vencidas, completadas.

#### 4. Fechas en todas las vistas

Todas las vistas (ClickUp, Grid, Tabla) mostraran:
- Fecha de inicio (`start_at`) si existe
- Fecha de fin/limite (`due_at`)
- Ambas en formato `dd/MM/yy`

#### 5. Drag-and-drop

El drag-and-drop ya existe y funciona en la vista Grid (DraggableGrid) y en subtareas. No requiere cambios adicionales. La vista ClickUp mantiene el orden por posicion dentro de cada grupo.

