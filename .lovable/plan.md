
## Fix: Eliminar Proyectos + Gestion Colaborativa de Tareas

### Problema 1: No se pueden eliminar proyectos

**Causa raiz**: La tabla `tasks` tiene una foreign key (`tasks_project_id_fkey`) que referencia `task_projects`. Cuando un proyecto tiene tareas asociadas, Postgres bloquea la eliminacion con error 409 (constraint violation).

**Solucion**: Modificar el `deleteProject` en `useProjects.ts` para que primero elimine las subtareas asociadas, luego las tareas del proyecto, luego los miembros, y finalmente el proyecto.

---

### Problema 2: Gestion colaborativa de proyectos

La infraestructura ya existe parcialmente: hay una tabla `project_members` y el codigo ya soporta asignar miembros a proyectos. Sin embargo, la visibilidad y asignacion cruzada necesitan mejoras.

**Lo que ya funciona:**
- Crear proyectos con miembros
- Asignar tareas a cualquier perfil de la misma compania
- Ver miembros en las tarjetas de proyecto

**Lo que falta para una experiencia colaborativa completa:**
- Actualmente las RLS policies de `task_projects` y `tasks` ya permiten ver proyectos/tareas donde el usuario es miembro, creador, o tiene tareas asignadas (via funciones `is_project_member`, `is_project_creator`, `user_has_tasks_in_project`)
- No se necesitan cambios en la base de datos para esta funcionalidad

---

### Cambios planificados

#### 1. `src/pages/tareas/useProjects.ts` -- Fix eliminacion en cascada

Modificar `deleteProject.mutationFn` para ejecutar en orden:
1. Obtener todas las tareas del proyecto
2. Eliminar subtareas de esas tareas (`subtasks` where `task_id` in task IDs)
3. Eliminar las tareas del proyecto (`tasks` where `project_id`)
4. Eliminar los miembros del proyecto (`project_members` where `project_id`)
5. Eliminar el proyecto (`task_projects` where `id`)

#### 2. `src/pages/tareas/DeleteProjectDialog.tsx` -- Mejorar advertencia

Actualizar el mensaje de confirmacion para advertir que se eliminaran tambien todas las tareas y subtareas del proyecto.

---

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/tareas/useProjects.ts` | Eliminacion en cascada (subtareas, tareas, miembros, proyecto) |
| `src/pages/tareas/DeleteProjectDialog.tsx` | Mensaje de advertencia mas claro |

### Notas tecnicas

- No se requieren migraciones de base de datos
- La eliminacion en cascada se hace desde el cliente en orden secuencial para respetar las foreign keys
- La funcionalidad colaborativa ya esta soportada por la arquitectura existente (project_members + RLS policies con SECURITY DEFINER functions)
