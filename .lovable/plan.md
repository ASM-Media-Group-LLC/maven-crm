

# Plan: Vista Global Kanban + Analíticas en página principal de Tareas

## Resumen

Agregar a `ProjectsListContent.tsx` (página `/tareas`) tres modos de vista: **Proyectos** (actual), **Kanban Global** (todas las tareas de todos los proyectos), y **Analíticas Globales**. La vista de proyectos sigue siendo el default.

## Cambios

### 1. Nuevo componente: `GlobalKanbanView.tsx`
- Reutiliza la estructura de `TaskKanbanView.tsx` pero muestra tareas de **todos los proyectos**
- Columnas por estado: Pendiente, En curso, Pausada, Vencida, Completada
- Cada card muestra: nombre del proyecto (badge), título de tarea, prioridad, assignees, fecha
- Drag-and-drop entre columnas para cambiar status (requiere mutación cross-project)
- Click en card abre `TaskDetailSheet`

### 2. Nuevo componente: `GlobalAnalyticsTab.tsx`
- Reutiliza la lógica de `TaskAnalyticsTab.tsx` pero con datos agregados de todos los proyectos
- Gráficos adicionales:
  - **Tareas por proyecto** (bar chart horizontal)
  - **Distribución por estado** (pie chart)
  - **Distribución por prioridad** (bar chart)
  - **Carga por miembro** (bar chart con asignadas vs completadas)
  - **Tendencia de completación** (line chart últimos 30 días)

### 3. Modificar `ProjectsListContent.tsx`
- Agregar `mainView` state: `"projects" | "kanban" | "analytics"`
- Agregar botones de vista en el header (íconos: FolderOpen, Columns, BarChart3)
- Cuando `mainView === "kanban"`: renderizar `GlobalKanbanView`
- Cuando `mainView === "analytics"`: renderizar `GlobalAnalyticsTab`
- Cuando `mainView === "projects"`: comportamiento actual

### 4. Modificar `useProjects.ts`
- Expandir la query de `allTasks` para incluir campos completos (title, assignees, priority, start_at, completed_at, etc.) necesarios para el kanban global y las analíticas
- Agregar mutación `updateGlobalTaskStatus` para cambiar status desde el kanban global

### Detalle técnico

| Archivo | Acción |
|---------|--------|
| `src/pages/tareas/GlobalKanbanView.tsx` | Crear — tablero kanban con todas las tareas agrupadas por status |
| `src/pages/tareas/GlobalAnalyticsTab.tsx` | Crear — dashboard analítico con gráficos recharts |
| `src/pages/tareas/ProjectsListContent.tsx` | Modificar — agregar toggle de vistas (projects/kanban/analytics) |
| `src/pages/tareas/useProjects.ts` | Modificar — expandir query allTasks + mutación updateGlobalTaskStatus |

### Dependencias
- `@hello-pangea/dnd` — ya instalada
- `recharts` — ya instalada
- No se requieren nuevas dependencias ni migraciones DB

