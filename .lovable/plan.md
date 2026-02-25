

## Plan: Miembros de proyecto deben ver todas las tareas y subtareas del proyecto

### Problema actual

Las politicas RLS de `tasks` solo permiten ver tareas donde el usuario es:
- `assigned_to` (asignado principal)
- `created_by` (creador)
- presente en `task_assignees` (asignado via junction table)

Un usuario que fue agregado como **miembro del proyecto** (`project_members`) pero no esta asignado a ninguna tarea especifica **no puede ver ninguna tarea** dentro de ese proyecto. Esto contradice la logica esperada: si te agregan a un proyecto, deberias ver todo su contenido.

El mismo problema afecta a `subtasks`, cuyas politicas RLS dependen de la visibilidad del parent task (solo revisan `assigned_to` y `created_by`, ni siquiera `task_assignees`).

### Solucion

Una migracion SQL que actualiza las politicas RLS de `tasks` y `subtasks` para agregar la verificacion de membresia de proyecto.

#### 1. Politicas de `tasks` (SELECT, UPDATE, DELETE)

Agregar condicion `is_project_member(auth.uid(), project_id)`:

```sql
auth.uid() = assigned_to
OR auth.uid() = created_by
OR EXISTS (SELECT 1 FROM task_assignees WHERE task_id = id AND user_id = auth.uid())
OR is_project_member(auth.uid(), project_id)  -- NUEVO
```

#### 2. Politicas de `subtasks` (SELECT, INSERT, UPDATE, DELETE)

Reemplazar la verificacion del parent task para incluir membresia de proyecto y task_assignees:

```sql
EXISTS (
  SELECT 1 FROM public.tasks
  WHERE tasks.id = subtasks.task_id
  AND (
    tasks.assigned_to = auth.uid()
    OR tasks.created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM task_assignees WHERE task_id = tasks.id AND user_id = auth.uid())
    OR is_project_member(auth.uid(), tasks.project_id)  -- NUEVO
  )
)
```

### Impacto

- Miembros de proyecto veran todas las tareas y subtareas del proyecto, sin necesidad de ser asignados individualmente
- El creador del proyecto y los asignados a tareas mantienen su acceso actual
- No se modifica codigo de aplicacion, solo SQL
- La funcion `is_project_member` ya existe como SECURITY DEFINER, evitando recursion RLS

### Archivo

| Archivo | Accion |
|---------|--------|
| Nueva migracion SQL | DROP/CREATE de 3 politicas en `tasks` + 4 politicas en `subtasks` |

