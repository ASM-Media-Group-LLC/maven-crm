
# Plan: Arreglar sidebar de proyectos vacío

## Problema
El `ProjectMiniSidebar` consulta proyectos filtrando por `company_id`, pero todos los proyectos tienen `company_id = null`. Por eso la lista sale vacía.

La forma correcta de obtener los proyectos del usuario es a través de la tabla `project_members`, que sí tiene los datos correctos (confirmado en la DB).

## Cambio en `ProjectMiniSidebar.tsx`

Reemplazar la query actual (que busca `company_id` en profiles y luego filtra `task_projects`) por una que:

1. Consulte `project_members` filtrando por `user_id = user.id`
2. Haga join con `task_projects` para obtener nombre y status
3. Filtre solo proyectos con `status = 'active'`
4. Ordene alfabéticamente

```sql
-- Lógica equivalente:
SELECT tp.id, tp.name, tp.status
FROM project_members pm
JOIN task_projects tp ON tp.id = pm.project_id
WHERE pm.user_id = :userId AND tp.status = 'active'
ORDER BY tp.name
```

En Supabase client esto se traduce a:
```ts
const { data: memberships } = await supabase
  .from("project_members")
  .select("project_id, task_projects!inner(id, name, status)")
  .eq("user_id", user.id)
  .eq("task_projects.status", "active");
```

O alternativamente, dos queries simples: obtener los `project_id` del usuario desde `project_members`, luego fetch de `task_projects` con `.in("id", projectIds)`.

## Archivo modificado
| Archivo | Cambio |
|---------|--------|
| `ProjectMiniSidebar.tsx` | Reemplazar query por company_id → query por project_members del usuario |
