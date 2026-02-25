

## Diagnóstico: Por qué no se guarda el líder de Trafix

### Problema 1: RLS bloquea la actualización (PRINCIPAL)

La política RLS de UPDATE en `task_projects` es:
```sql
auth.uid() = created_by
```

El proyecto Trafix fue creado por **Daniel Botero** (`b9646617-...`), pero la usuaria actual es **Marielby Quijada** (`471666b6-...`). Como Marielby no es la creadora del proyecto, el UPDATE se ejecuta pero **no afecta ninguna fila** (Supabase retorna 204 silenciosamente). El request de red confirma esto: el PATCH retorna 204 pero el `leader_id` sigue en `null` en la base de datos.

### Problema 2: El código no detecta el fallo silencioso

El mutation en `useProjects.ts` no verifica si el UPDATE realmente modificó alguna fila. Como Supabase no lanza error cuando RLS bloquea un update (simplemente no modifica nada), el toast "Proyecto actualizado" aparece aunque no se guardó nada.

### Solución

#### 1. Corregir la política RLS de UPDATE

Actualizar la política para permitir que **miembros del proyecto** también puedan actualizar (no solo el creador):

```sql
DROP POLICY "Creators can update projects" ON task_projects;
CREATE POLICY "Project members and creators can update projects"
  ON task_projects FOR UPDATE
  USING (
    auth.uid() = created_by
    OR is_project_member(auth.uid(), id)
  );
```

Esto permite que Marielby (y cualquier miembro asignado al proyecto) pueda editar el proyecto, incluyendo asignar líder.

#### 2. (Opcional) Agregar verificación de filas afectadas

En `useProjects.ts`, cambiar el update para usar `.select()` y verificar que se retornó una fila, mostrando un error descriptivo si RLS bloqueó el cambio.

### Archivos a modificar

| Recurso | Cambio |
|---------|--------|
| Migración SQL | Actualizar política RLS de UPDATE en `task_projects` |
| `src/pages/tareas/useProjects.ts` | (Opcional) Agregar `.select()` al update para detectar fallos silenciosos |

