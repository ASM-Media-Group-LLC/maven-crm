

# Rediseño del Gestor de Tareas — Estilo Microsoft Planner

## Resumen

Transformar el módulo de Tareas (`/tareas/:projectId`) en un gestor de proyectos completo inspirado en Microsoft Planner, agregando: (1) vista Kanban con drag-and-drop, (2) sistema de comentarios en tareas, y (3) pestaña de analíticas/diagramas del proyecto.

---

## Estado Actual

- **Vistas existentes**: Grid (tarjetas), Lista (tabla), ClickUp (agrupado por estado) — ninguna es Kanban con columnas arrastrables
- **Drag-and-drop**: Solo reordenamiento dentro de la misma vista (DraggableGrid), no entre columnas de estado
- **Comentarios**: No existen — ni tabla en DB ni UI
- **Analíticas**: Solo KPIs numéricos (pendientes, en curso, etc.) — sin gráficos ni diagramas
- **Librería DnD**: `@hello-pangea/dnd` ya instalada (usada en ProyectoMP)

---

## Plan de Implementación

### 1. Nueva tabla `task_comments` en Supabase

Crear migración SQL con:
- `id`, `task_id` (FK a tasks), `user_id` (FK a auth.users), `content` (text), `created_at`
- RLS: los miembros del proyecto pueden ver/crear comentarios
- Trigger `update_updated_at` estándar

### 2. Vista Kanban con Drag-and-Drop (nueva vista)

**Archivo**: `src/pages/tareas/TaskKanbanView.tsx`

- Columnas por estado: Pendiente, En curso, Pausada, Vencida, Completada
- Usa `@hello-pangea/dnd` (ya instalado) con `DragDropContext` + `Droppable` por columna + `Draggable` por tarjeta
- Al soltar una tarjeta en otra columna, se llama `updateTaskStatus` (ya existe en `useTareas`)
- Header de columna con conteo de tareas y color por estado
- Tarjetas compactas mostrando: titulo, prioridad (flag color), assignees (avatares), fecha limite, indicador de comentarios
- Reordenamiento vertical dentro de la misma columna (usa campo `position`)

**Integración en TareasContent.tsx**:
- Agregar icono "Columns" al selector de vistas (junto a Grid, List, ClickUp)
- Nuevo `viewMode: "kanban"` que renderiza `TaskKanbanView`

### 3. Panel de Detalle de Tarea con Comentarios

**Archivo**: `src/pages/tareas/TaskDetailSheet.tsx`

- Sheet (drawer lateral derecho) que se abre al hacer clic en cualquier tarjeta del Kanban
- Secciones:
  - Info de la tarea (titulo, descripcion, estado, prioridad, asignados, fechas)
  - Subtareas (reutiliza `SubtasksPanel` existente)
  - **Comentarios**: lista cronológica con avatar + nombre + timestamp + contenido, input para nuevo comentario al fondo
- Hook `useTaskComments(taskId)` con queries de lectura e inserción

### 4. Pestaña de Analíticas del Proyecto

**Archivo**: `src/pages/tareas/TaskAnalyticsTab.tsx`

Agregar un toggle/tab "Analíticas" en la cabecera del proyecto que muestre:

- **Burndown chart**: tareas completadas vs tiempo (línea ideal vs real) usando Recharts (ya instalado)
- **Distribución por estado**: gráfico de dona (Pendiente/En curso/Pausada/Vencida/Completada)
- **Distribución por prioridad**: barras horizontales coloreadas
- **Carga por miembro**: barras por persona mostrando tareas asignadas vs completadas
- **Tareas vencidas sin justificar**: tabla resumida con alerta
- **Timeline/Gantt simplificado**: barras horizontales por tarea mostrando duración (start_at → due_at) con color por estado

---

## Detalle Técnico

### Migración SQL
```sql
CREATE TABLE public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
-- Policies para miembros del proyecto
```

### Archivos nuevos
| Archivo | Propósito |
|---------|-----------|
| `TaskKanbanView.tsx` | Vista Kanban con columnas DnD |
| `TaskDetailSheet.tsx` | Drawer lateral con detalle + comentarios |
| `TaskAnalyticsTab.tsx` | Gráficos y diagramas del proyecto |
| `useTaskComments.ts` | Hook para CRUD de comentarios |

### Archivos modificados
| Archivo | Cambio |
|---------|--------|
| `TareasContent.tsx` | Agregar viewMode "kanban", botón analíticas, renderizar nuevos componentes |
| `useTareas.ts` | Sin cambios (ya tiene `updateTaskStatus`) |

### Dependencias
- `@hello-pangea/dnd` — ya instalada
- `recharts` — ya instalada
- No se requieren nuevas dependencias

