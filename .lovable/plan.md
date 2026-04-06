

# Plan: Clasificación de tareas (Hito / Pre-requisito / Tarea independiente)

## Resumen
Agregar un campo `task_type` a la tabla `tasks` que permita clasificar cada tarea como **Hito**, **Pre-requisito** o **Tarea independiente**. Este campo será editable desde la creación, edición inline y el detalle de tarea.

## Cambios en Base de Datos

### Migración SQL
```sql
ALTER TABLE tasks ADD COLUMN task_type text NOT NULL DEFAULT 'independent';
```
Valores válidos: `milestone` (Hito), `prerequisite` (Pre-requisito), `independent` (Tarea independiente).

## Cambios en Código

### 1. Modelo de datos — `useTareas.ts`
- Agregar `task_type: string` a la interfaz `Task`
- Incluir `task_type` en el `createTask` y `patchTask`

### 2. Creación de tarea — `CreateTaskDialog.tsx`
- Agregar un selector de tipo de tarea (Select con las 3 opciones) en el formulario de creación
- Default: "Tarea independiente"

### 3. Vista Kanban — Tarjetas
- Mostrar un badge/ícono visual que indique el tipo:
  - **Hito**: ícono de diamante/bandera, badge morado
  - **Pre-requisito**: ícono de enlace/cadena, badge naranja
  - **Independiente**: sin badge (default)

### 4. Vista Lista — `TaskListRow.tsx`
- Mostrar el tipo como un badge pequeño junto al nombre de la tarea

### 5. Detalle de tarea — `TaskDetailPage.tsx`
- Agregar campo editable de tipo de tarea en los metadatos (columna izquierda)

### 6. Edición inline
- Permitir cambiar el tipo desde el menú contextual de la tarea (tanto en Kanban como en Lista)

## Archivos a modificar
| Archivo | Cambio |
|---------|--------|
| DB migration | `ALTER TABLE tasks ADD COLUMN task_type` |
| `useTareas.ts` | Agregar campo a interfaz y mutaciones |
| `CreateTaskDialog.tsx` | Selector de tipo en formulario |
| `TaskListRow.tsx` | Badge de tipo en vista lista |
| `TaskKanbanCard.tsx` | Badge de tipo en tarjeta kanban |
| `TaskDetailPage.tsx` | Campo editable de tipo |

