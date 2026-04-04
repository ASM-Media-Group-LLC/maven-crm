

# Plan: Agregar usuario a proyectos + simplificar vistas

## 1. Agregar Jose Ignacio Vera Alvarez a todos los proyectos

**User ID**: `071de069-206c-4f54-821f-09b0ae3b92ce`

Insertar en `project_members` para los 13 proyectos existentes (con `ON CONFLICT DO NOTHING` para evitar duplicados). Esto le da acceso completo: ver tareas, crear tareas, asignar usuarios, comentar.

## 2. Simplificar vistas del gestor de tareas

**Cambios en `TareasContent.tsx`**:

- Cambiar vista por defecto de `"clickup"` a `"kanban"`
- Eliminar los botones de vista "ClickUp" (`AlignJustify`) y "Grid" (`LayoutGrid`)
- Mantener solo **Kanban** (columnas) y **Lista** (tabla)
- Eliminar imports y renderizado condicional de `TaskListView` (ClickUp) y `DraggableGrid`/`TaskCard` (Grid)
- Tipo de `viewMode` pasa a ser `"kanban" | "list"`

**Archivos que ya no se usan** (se pueden dejar pero no se importan):
- `TaskListView.tsx` — vista ClickUp agrupada
- `DraggableGrid.tsx` / `TaskCard.tsx` — vista grid con tarjetas

## Detalle Técnico

| Accion | Detalle |
|--------|---------|
| INSERT `project_members` | 13 filas para user `071de069...` en todos los proyectos |
| `TareasContent.tsx` | Default `"kanban"`, quitar botones ClickUp/Grid, limpiar imports y renders |
| Imports removidos | `AlignJustify`, `LayoutGrid`, `TaskListView`, `DraggableGrid`, `TaskCard` |

