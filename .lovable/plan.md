

## Vista Kanban con Drag-and-Drop para Tareas y Proyectos

### Resumen
Transformar la vista Grid del modulo de Tareas en un tablero estilo Kanban (similar a Asana/Jira) donde las tarjetas de proyectos y tareas se puedan arrastrar y reorganizar libremente. La vista Grid pasa a ser la predeterminada.

---

### 1. Cambios en Base de Datos

Se necesita un campo `position` en ambas tablas para persistir el orden personalizado del usuario.

| Tabla | Columna nueva | Tipo | Default |
|-------|--------------|------|---------|
| `task_projects` | `position` | integer | 0 |
| `tasks` | `position` | integer | 0 |

Migracion SQL:
```text
ALTER TABLE public.task_projects ADD COLUMN position integer NOT NULL DEFAULT 0;
ALTER TABLE public.tasks ADD COLUMN position integer NOT NULL DEFAULT 0;
```

---

### 2. Cambios en la Vista de Proyectos (`ProjectsListContent.tsx`)

- Cambiar el default de `viewMode` de `"list"` a `"grid"`
- Reemplazar el grid estatico de tarjetas de proyectos por un nuevo componente `DraggableProjectsGrid` que implemente drag-and-drop nativo (HTML5) para reordenar las cards
- Ordenar proyectos por `position` en lugar de `created_at`
- Al soltar una card, actualizar el campo `position` de los proyectos afectados en Supabase

### 3. Cambios en la Vista de Tareas (`TareasContent.tsx`)

- Cambiar el default de `viewMode` de `"grid"` (ya esta) -- confirmar que ya es grid
- Reemplazar el grid estatico de TaskCards por un nuevo componente `DraggableTasksGrid` con drag-and-drop nativo
- Ordenar tareas por `position` como criterio principal (en lugar del ordenamiento por urgencia actual, que se mantendra como fallback cuando `position` sea 0 para todas)
- Al soltar una card, actualizar el campo `position` de las tareas afectadas en Supabase

### 4. Componente Reutilizable: `DraggableGrid`

Crear un componente generico `DraggableGrid` que encapsule la logica de drag-and-drop para evitar duplicacion entre proyectos y tareas.

**Archivo:** `src/pages/tareas/DraggableGrid.tsx`

Funcionalidad:
- Acepta una lista de items con `id` y un renderizador de cards
- Maneja `draggable`, `onDragStart`, `onDragOver`, `onDrop` con estados visuales (indicador de posicion de destino)
- Feedback visual: borde resaltado en la posicion de destino, opacidad reducida en la card arrastrada
- Callback `onReorder(reorderedIds: string[])` que el padre usa para persistir el nuevo orden

### 5. Hook de Reordenamiento

**Agregar a `useProjects.ts`:**
- Mutation `reorderProjects` que recibe un array de IDs ordenados y actualiza el campo `position` de cada proyecto

**Agregar a `useTareas.ts`:**
- Mutation `reorderTasks` que recibe un array de IDs ordenados y actualiza el campo `position` de cada tarea
- Modificar la query de tareas para ordenar por `position ASC, due_at ASC`

### 6. Subtareas -- Ya Implementado

El drag-and-drop de subtareas ya existe en `SubtasksPanel.tsx` con el campo `position` en la tabla `subtasks`. No se necesitan cambios adicionales.

---

### Archivos a crear

| Archivo | Descripcion |
|---------|-------------|
| `src/pages/tareas/DraggableGrid.tsx` | Componente generico de grid con drag-and-drop |

### Archivos a modificar

| Archivo | Cambios |
|---------|---------|
| Migracion SQL | Agregar columna `position` a `task_projects` y `tasks` |
| `src/pages/tareas/useProjects.ts` | Agregar mutation `reorderProjects`, ordenar por `position` |
| `src/pages/tareas/useTareas.ts` | Agregar mutation `reorderTasks`, ordenar por `position, due_at` |
| `src/pages/tareas/ProjectsListContent.tsx` | Default a grid, usar `DraggableGrid` |
| `src/pages/tareas/TareasContent.tsx` | Usar `DraggableGrid` en vez del grid estatico |
| `src/integrations/supabase/types.ts` | Agregar `position` a los tipos de tasks y task_projects |

### Flujo de usuario

1. El usuario entra a `/tareas` y ve los proyectos en formato Grid (vista por defecto)
2. Arrastra una tarjeta de proyecto y la suelta en otra posicion -- el orden se guarda automaticamente
3. Al entrar a un proyecto, ve las tareas tambien en Grid
4. Arrastra tarjetas de tareas para reorganizarlas a su gusto
5. El orden personalizado se persiste y se mantiene entre sesiones
6. Puede cambiar a vista de Tabla en cualquier momento con el toggle existente

