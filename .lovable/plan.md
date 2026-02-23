

## Asignacion multiple de usuarios en Tareas y Subtareas (estilo Asana)

### Resumen

Actualmente las tareas y subtareas solo permiten asignar **un usuario** (columna `assigned_to` tipo UUID). Se necesita permitir **multiples asignados** en tareas, subtareas, y mantener la consistencia con la asignacion de proyectos.

### Enfoque: Tabla de relacion (junction table)

Se creara una tabla `task_assignees` y `subtask_assignees` para manejar las relaciones muchos-a-muchos, manteniendo la columna `assigned_to` original como "asignado principal" para compatibilidad.

---

### 1. Migracion de base de datos

Crear dos tablas nuevas:

```sql
-- task_assignees: multiples asignados por tarea
CREATE TABLE task_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(task_id, user_id)
);
ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage task_assignees" ON task_assignees FOR ALL USING (true) WITH CHECK (true);

-- subtask_assignees: multiples asignados por subtarea
CREATE TABLE subtask_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subtask_id uuid NOT NULL REFERENCES subtasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(subtask_id, user_id)
);
ALTER TABLE subtask_assignees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage subtask_assignees" ON subtask_assignees FOR ALL USING (true) WITH CHECK (true);
```

### 2. Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/tareas/CreateTaskModal.tsx` | Cambiar selector de usuario unico a multi-select con chips (como en proyectos) |
| `src/pages/tareas/EditTaskModal.tsx` | Mismo cambio: multi-select con chips |
| `src/pages/tareas/useTareas.ts` | En `createTask`: insertar en `task_assignees` + notificaciones. En `updateTask`: sincronizar asignados. Agregar query de `task_assignees` para cada tarea |
| `src/pages/tareas/SubtaskItem.tsx` | Cambiar selector de asignado unico a multi-select |
| `src/pages/tareas/SubtasksPanel.tsx` | Cambiar selector de asignado en formulario de creacion a multi-select |
| `src/pages/tareas/useSubtasks.ts` | En create/update: insertar/sincronizar `subtask_assignees` |
| `src/pages/tareas/TaskCard.tsx` | Mostrar multiples avatares/nombres de asignados |
| `src/pages/tareas/TaskListRow.tsx` | Mostrar multiples asignados en la fila |
| `src/pages/tareas/TasksTable.tsx` | Mostrar multiples asignados en la columna |

### 3. Logica de UI

- **Selector multi-usuario**: Se reutilizara el patron de combobox multi-select con `Badge` + `X` que ya existe en `CreateProjectModal.tsx` (exactamente el mismo componente de seleccion de miembros de proyecto).
- **Visualizacion**: Los asignados se mostraran como avatares apilados (max 3 visibles + "+N") en las tarjetas y filas.
- **Compatibilidad**: La columna `assigned_to` existente se mantendra como el "primer asignado" para no romper queries RLS existentes. La tabla `task_assignees` sera la fuente de verdad.

### 4. Notificaciones

Al asignar nuevos usuarios a una tarea o subtarea, se insertara una notificacion tipo `task_assignment` para cada usuario nuevo:

```
type: "task_assignment"
title: "Te asignaron una tarea"
message: "Fuiste asignado(a) a la tarea '{titulo}'"
reference_id: task_id o subtask_id
reference_type: "task" o "subtask"
```

### 5. Flujo simplificado

1. Usuario crea/edita tarea -> selecciona multiples usuarios
2. Se guarda `assigned_to` con el primer seleccionado (compatibilidad)
3. Se insertan todos los seleccionados en `task_assignees`
4. Se envian notificaciones a los nuevos asignados
5. En las vistas se muestran todos los asignados desde `task_assignees`

