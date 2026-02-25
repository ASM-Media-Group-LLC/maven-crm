

## Diagnóstico: Tareas asignadas no visibles

### Causa raíz identificada

Las políticas RLS de la tabla `tasks` y la función `user_has_tasks_in_project` solo verifican las columnas `assigned_to` y `created_by` — **ignoran completamente la tabla `task_assignees`** (junction table de asignación múltiple).

Cuando alguien te asigna una tarea, tu `user_id` se inserta en `task_assignees`, pero si no eres el **primer asignado** (que se guarda en `assigned_to`) ni el creador, la política RLS te bloquea la lectura.

```text
Flujo actual (roto):

  Crear tarea → assigned_to = usuario1 (primer asignado)
                → task_assignees: [usuario1, usuario2, usuario3]

  RLS SELECT en tasks:
    auth.uid() = assigned_to   → solo usuario1 ✓
    auth.uid() = created_by    → solo creador ✓
    usuario2, usuario3         → ✗ BLOQUEADOS
```

### Políticas afectadas

| Tabla/Función | Política | Problema |
|---|---|---|
| `tasks` SELECT | `auth.uid() = assigned_to OR auth.uid() = created_by` | No revisa `task_assignees` |
| `tasks` UPDATE | `auth.uid() = assigned_to OR auth.uid() = created_by` | Mismo problema |
| `tasks` DELETE | `auth.uid() = assigned_to OR auth.uid() = created_by` | Mismo problema |
| `user_has_tasks_in_project()` | Solo revisa `assigned_to` y `created_by` | No revisa `task_assignees`, afecta visibilidad de proyectos |

### Solución

Una migración SQL que:

1. **Actualiza la función `user_has_tasks_in_project`** para incluir un check adicional contra `task_assignees`:
   ```sql
   SELECT EXISTS (
     SELECT 1 FROM public.tasks
     WHERE project_id = _project_id
     AND (assigned_to = _user_id OR created_by = _user_id)
   ) OR EXISTS (
     SELECT 1 FROM public.task_assignees ta
     JOIN public.tasks t ON ta.task_id = t.id
     WHERE t.project_id = _project_id AND ta.user_id = _user_id
   )
   ```

2. **Reemplaza las 3 políticas RLS de `tasks`** (SELECT, UPDATE, DELETE) para agregar la condición:
   ```sql
   ... OR EXISTS (
     SELECT 1 FROM public.task_assignees
     WHERE task_id = id AND user_id = auth.uid()
   )
   ```

### Impacto

- Usuarios asignados vía `task_assignees` podrán ver, editar y eliminar las tareas donde están asignados
- Los proyectos que contienen esas tareas también serán visibles (por la función `user_has_tasks_in_project` corregida)
- No se modifica código de aplicación — solo SQL

### Archivos

| Archivo | Acción |
|---|---|
| `supabase/migrations/...fix_task_rls_assignees.sql` | Nuevo — migración con DROP/CREATE de políticas + OR REPLACE de función |

