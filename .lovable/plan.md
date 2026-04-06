

# Plan: Cambiar default de task_type a `task`

## Valores válidos (4 tipos)
- `task` — Tarea común (nuevo default)
- `milestone` — Hito
- `prerequisite` — Pre-requisito
- `independent` — Tarea independiente

## Cambios

### 1. Migración DB
```sql
ALTER TABLE tasks ALTER COLUMN task_type SET DEFAULT 'task';
UPDATE tasks SET task_type = 'task' WHERE task_type = 'independent';
```
Solo cambia el default. `independent` sigue siendo un valor válido.

### 2. Código — actualizar defaults y labels

| Archivo | Cambio |
|---------|--------|
| `useTareas.ts` | Default en createTask: `'task'` |
| `CreateTaskDialog.tsx` | Default del select: `'task'`, agregar opción "Independiente" al selector |
| `TaskKanbanCard.tsx` | No mostrar badge para `task`, mostrar badge gris para `independent` |
| `TaskListRow.tsx` | Mismo criterio de badges |
| `TaskDetailPage.tsx` | Default y labels con las 4 opciones |

### Badges visuales
- **Hito**: diamante, badge morado
- **Pre-requisito**: enlace, badge naranja
- **Independiente**: badge gris
- **Tarea**: sin badge (default, no necesita distinguirse)

