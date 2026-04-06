

# Plan: Filtro y columna de Tipo de Tarea

## Cambios

### 1. Filtro en barra de filtros — `TareasContent.tsx`
- Agregar estado `taskTypeFilter` (línea ~52)
- Agregar `Select` de tipo de tarea junto a los filtros de Estado y Prioridad (después de línea 500)
- Opciones: Todos, Tarea, Hito, Pre-requisito, Independiente
- Incluir el filtro en `filteredAndSortedTasks` (línea ~91)

### 2. Columna "Tipo" en tabla — `TasksTable.tsx`
- Agregar columna "Tipo" al `TableHeader` (entre Título y Asignado por)
- Renderizar badge visual (diamante morado para Hito, enlace naranja para Pre-req, gris para Independiente, sin badge para Tarea estándar)
- Agregar soporte de ordenamiento por `task_type`

### 3. Vista Lista (TaskListRow) — ya tiene badges
Los badges ya están implementados en `TaskListRow.tsx`. No requiere cambios.

## Archivos modificados
| Archivo | Cambio |
|---------|--------|
| `TareasContent.tsx` | Agregar filtro `taskTypeFilter` + Select en barra de filtros |
| `TasksTable.tsx` | Agregar columna "Tipo" con badges y ordenamiento |

