

# Plan: Mejoras al Gestor de Tareas

## Resumen
Tres cambios: (1) vista lista como default con columnas reordenadas, (2) click en fila abre detalle de tarea, (3) nuevo sistema de bloqueos.

---

## 1. Vista Lista como predeterminada + Reordenar columnas

**`TareasContent.tsx`**: Cambiar default de `viewMode` de `"kanban"` a `"list"`.

**`TasksTable.tsx`**: Reordenar columnas del `<TableHeader>` a:
1. Título
2. Responsable (renombrar "Asignado a")
3. Fecha inicio
4. Fecha fin
5. Tipo (se mantiene)
6. Countdown (se mantiene)
7. Prioridad
8. Estado
9. Acciones

Se renombra "Asignado a" → "Responsable". Se mantienen Tipo, Countdown y todas las columnas existentes.

## 2. Detalle de tarea desde vista Lista

Actualmente el Kanban pasa `onTaskClick={setDetailTask}` pero `TasksTable` no tiene esta prop.

**Cambios:**
- Agregar prop `onTaskClick` a `TasksTable`
- Hacer click en la fila (`<TableRow>`) abra el detalle, con `onClick` en el row (excluyendo clicks en dropdowns/controles inline)
- En `TareasContent.tsx`, pasar `onTaskClick={setDetailTask}` a `TasksTable`

## 3. Funcionalidad de Bloqueos

### Base de datos — nueva tabla `task_blockers`
```sql
CREATE TABLE public.task_blockers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  blocked_by_user_id UUID REFERENCES auth.users(id),
  reported_by UUID NOT NULL REFERENCES auth.users(id),
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_blockers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project members can manage blockers"
  ON public.task_blockers FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tasks t
    JOIN project_members pm ON pm.project_id = t.project_id
    WHERE t.id = task_blockers.task_id AND pm.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM tasks t
    JOIN project_members pm ON pm.project_id = t.project_id
    WHERE t.id = task_blockers.task_id AND pm.user_id = auth.uid()
  ));
```

### Nuevos archivos
- **`useTaskBlockers.ts`**: Hook CRUD — obtener bloqueos activos, crear bloqueo (razón + persona asignada), resolver bloqueo
- **`TaskBlockerBadge.tsx`**: Icono/badge rojo junto al título en tabla y kanban cuando hay bloqueos activos
- **`TaskBlockerSection.tsx`**: Sección en `TaskDetailPage` para ver bloqueos activos, crear nuevos (textarea razón + selector de persona que desbloquea), y marcar como resueltos

### Integración
- **TasksTable**: Badge de bloqueo junto al título
- **TaskKanbanView**: Indicador en tarjetas
- **TaskDetailPage**: Nueva sección "Bloqueos" con lista de activos, botón para reportar bloqueo, y botón resolver

---

## Archivos a modificar/crear

| Archivo | Cambio |
|---------|--------|
| `TareasContent.tsx` | Default `"list"`, pasar `onTaskClick` a TasksTable |
| `TasksTable.tsx` | Reordenar columnas, renombrar a "Responsable", agregar `onTaskClick`, badge bloqueo |
| `TaskKanbanView.tsx` | Badge de bloqueo en tarjetas |
| `TaskDetailPage.tsx` | Sección de bloqueos |
| `useTaskBlockers.ts` (nuevo) | Hook CRUD bloqueos |
| `TaskBlockerSection.tsx` (nuevo) | UI gestión de bloqueos |
| `TaskBlockerBadge.tsx` (nuevo) | Indicador visual |
| Migración SQL | Tabla `task_blockers` con RLS |

