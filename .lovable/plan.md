
# Plan: Mejoras avanzadas al módulo de Tareas (estilo ClickUp)

## 1. Botón Settings/More del proyecto dentro del proyecto

Agregar un `DropdownMenu` al lado de "Nueva Tarea" en `TareasContent.tsx` con las mismas opciones que existen en la página principal de proyectos:
- Editar proyecto (abre `EditProjectModal`)
- Compartir proyecto
- Archivar proyecto
- Eliminar proyecto

**Archivo**: `TareasContent.tsx` — agregar DropdownMenu con `MoreHorizontal` o `Settings` icon.

## 2. Task Detail en página/dialog completo (no Sheet lateral)

Reemplazar el `Sheet` lateral por un `Dialog` de pantalla completa (como ClickUp: layout de 2 columnas — detalles a la izquierda, actividad/comentarios a la derecha).

**Archivos**:
- Crear `TaskDetailPage.tsx` — Dialog fullscreen con layout tipo ClickUp:
  - **Izquierda**: título editable inline, descripción, estado, prioridad, asignados, fechas, subtareas, adjuntos
  - **Derecha**: panel de actividad/comentarios (como en la referencia)
- `TareasContent.tsx` — cambiar `TaskDetailSheet` por `TaskDetailPage`
- Eliminar `TaskDetailSheet.tsx` (ya no se usa)

## 3. Kanban cards más completas con edición inline

Enriquecer las tarjetas del Kanban en `TaskKanbanView.tsx` para mostrar más metadata y permitir edición inline (como ClickUp):
- Mostrar iconos de: subtareas (count), comentarios (count), adjuntos, fecha, prioridad (flag icon), asignados
- Agregar menú contextual (click derecho o botón `...`) en cada card con: cambiar estado, cambiar prioridad, editar, eliminar
- Iconos de acción rápida inline en el footer de la card

**Archivos**: `TaskKanbanView.tsx` — enriquecer cards con más metadata e inline actions.

## 4. Mini panel lateral de navegación entre proyectos

Agregar un panel colapsable a la izquierda dentro de `TareasContent.tsx` que muestre la lista de proyectos con:
- Nombre del proyecto con indicador visual (dot de color)
- Proyecto actual resaltado
- Click para navegar a otro proyecto
- Botón de estrella para marcar favoritos (guardado en localStorage por ahora)
- Colapsable con un botón toggle

**Archivos**:
- Crear `ProjectMiniSidebar.tsx` — componente del mini panel
- `TareasContent.tsx` — integrar el sidebar a la izquierda del contenido

## Archivos a modificar/crear

| Archivo | Cambio |
|---------|--------|
| `TareasContent.tsx` | Agregar settings dropdown, integrar mini sidebar, cambiar Sheet por Dialog |
| `TaskDetailPage.tsx` (nuevo) | Dialog fullscreen para detalle de tarea |
| `TaskKanbanView.tsx` | Cards más ricas con metadata e inline actions |
| `ProjectMiniSidebar.tsx` (nuevo) | Mini panel lateral de proyectos con favoritos |
| `TaskDetailSheet.tsx` | Eliminar (reemplazado) |

## Sin migraciones ni dependencias nuevas
