

## Mejoras al Modulo de Tareas: Subtareas Avanzadas, Usuarios en Proyectos y Fechas Opcionales

### Resumen

Se realizaran 4 mejoras principales:
1. Subtareas anidadas (subtarea dentro de subtarea) con soporte recursivo
2. Subtareas enriquecidas con fecha, prioridad y usuario asignado
3. Asignacion de multiples usuarios a proyectos
4. Hora de inicio/entrega opcional (solo la fecha es obligatoria)

---

### 1. Cambios en Base de Datos

**Tabla `subtasks` -- agregar columnas:**

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| `parent_subtask_id` | uuid (nullable) | NULL | Referencia a la subtarea padre para anidamiento |
| `assigned_to` | uuid (nullable) | NULL | Usuario asignado |
| `priority` | text | 'medium' | Prioridad (low/medium/high/urgent) |
| `due_at` | timestamptz (nullable) | NULL | Fecha limite |

**Nueva tabla `project_members`:**

| Columna | Tipo | Default | Descripcion |
|---------|------|---------|-------------|
| `id` | uuid | gen_random_uuid() | PK |
| `project_id` | uuid | NOT NULL | FK a task_projects |
| `user_id` | uuid | NOT NULL | ID del usuario |
| `role` | text | 'member' | Rol en el proyecto (owner/member) |
| `created_at` | timestamptz | now() | Fecha de creacion |

Con constraint UNIQUE en (project_id, user_id) y politicas RLS que permitan a miembros del proyecto ver/gestionar la membresía.

**Tabla `tasks` -- hacer `due_at` mas flexible:**
- Actualmente `due_at` es NOT NULL. Se mantendra asi pero la hora sera opcional en la UI (se asignara 23:59:59 del dia seleccionado si no se especifica hora).

---

### 2. Subtareas Anidadas (Recursivas)

**`useSubtasks.ts`:**
- Modificar la query para filtrar por `parent_subtask_id IS NULL` en el nivel raiz
- Agregar query/mutation para subtareas hijas dado un `parent_subtask_id`
- Agregar mutations para actualizar `assigned_to`, `priority`, `due_at`

**`SubtaskItem.tsx`:**
- Agregar boton para expandir/colapsar sub-subtareas
- Mostrar badges de prioridad y usuario asignado
- Mostrar fecha limite si existe
- Incluir un mini-panel colapsable de sub-subtareas (reutilizando SubtasksPanel con `parentSubtaskId`)

**`SubtasksPanel.tsx`:**
- Aceptar prop opcional `parentSubtaskId` para renderizar subtareas anidadas
- Al crear una subtarea, incluir campos opcionales: prioridad (select), fecha (date picker), usuario asignado (combobox)
- Pasar `parentSubtaskId` al crear subtareas hijas

---

### 3. Asignacion de Usuarios a Proyectos

**`CreateProjectModal.tsx` y `EditProjectModal.tsx`:**
- Agregar un selector multiple de usuarios (combobox multi-select) para asignar miembros al proyecto
- Al crear el proyecto, insertar registros en `project_members`

**`useProjects.ts`:**
- Agregar queries para obtener miembros del proyecto
- Agregar mutations para agregar/remover miembros
- Al crear un proyecto, el creador se agrega automaticamente como `owner`

**`ProjectsListContent.tsx`:**
- Mostrar avatares/nombres de los miembros en las cards de proyecto

---

### 4. Hora Opcional en Tareas

**`CreateTaskModal.tsx` y `EditTaskModal.tsx`:**
- En el modo "Fecha", la hora de inicio y la hora de fin pasan a ser opcionales
- Si no se selecciona hora de fin, se usa 23:59 del dia seleccionado como `due_at`
- Si no se selecciona hora de inicio, simplemente se omite
- El modo "Duracion" se mantiene igual

---

### Archivos a crear

| Archivo | Descripcion |
|---------|-------------|
| Migracion SQL | Nuevas columnas en subtasks + tabla project_members + RLS |

### Archivos a modificar

| Archivo | Cambios |
|---------|---------|
| `src/pages/tareas/useSubtasks.ts` | Soporte para parent_subtask_id, assigned_to, priority, due_at |
| `src/pages/tareas/SubtaskItem.tsx` | UI de prioridad, usuario, fecha, boton de sub-subtareas expandible |
| `src/pages/tareas/SubtasksPanel.tsx` | Prop parentSubtaskId, campos enriquecidos al crear |
| `src/pages/tareas/useProjects.ts` | Queries/mutations para project_members |
| `src/pages/tareas/CreateProjectModal.tsx` | Selector de miembros del proyecto |
| `src/pages/tareas/EditProjectModal.tsx` | Selector de miembros del proyecto |
| `src/pages/tareas/ProjectsListContent.tsx` | Mostrar miembros en cards |
| `src/pages/tareas/CreateTaskModal.tsx` | Hora opcional (default 23:59 si no se especifica) |
| `src/pages/tareas/EditTaskModal.tsx` | Hora opcional |
| `src/integrations/supabase/types.ts` | Tipos actualizados automaticamente |

---

### Flujo de usuario

1. Al crear un proyecto, se pueden agregar miembros del equipo (selector multiple)
2. Las cards de proyecto muestran los miembros asignados
3. Al crear una tarea, la hora es opcional -- solo la fecha importa
4. Al abrir subtareas de una tarea, se puede asignar prioridad, fecha y usuario a cada subtarea
5. Cada subtarea tiene un boton para agregar sub-subtareas (anidamiento recursivo)
6. Las sub-subtareas tambien soportan prioridad, fecha y usuario asignado

