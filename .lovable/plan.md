

## Corregir recursion infinita en RLS de task_projects y project_members

### Problema

Las politicas RLS de `task_projects` y `project_members` se referencian mutuamente:
- `task_projects` SELECT consulta `project_members`
- `project_members` SELECT/INSERT/UPDATE/DELETE consulta `task_projects`

Esto causa el error `42P17: infinite recursion detected in policy`. Ademas, la politica SELECT de `task_projects` tiene un bug: `pm.project_id = pm.id` deberia ser `pm.project_id = task_projects.id`.

### Solucion

Crear funciones SECURITY DEFINER que rompan el ciclo de recursion, luego reemplazar las politicas RLS.

### Cambios (una sola migracion SQL)

1. **Crear funcion `is_project_member`** (SECURITY DEFINER) que consulta `project_members` directamente sin pasar por RLS:

```sql
CREATE OR REPLACE FUNCTION public.is_project_member(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE user_id = _user_id AND project_id = _project_id
  )
$$;
```

2. **Crear funcion `is_project_creator`** (SECURITY DEFINER) que consulta `task_projects` directamente:

```sql
CREATE OR REPLACE FUNCTION public.is_project_creator(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_projects
    WHERE id = _project_id AND created_by = _user_id
  )
$$;
```

3. **Reemplazar politica SELECT de `task_projects`** para usar la funcion en vez de subconsulta directa (y corregir el bug `pm.project_id = pm.id`):

```sql
DROP POLICY IF EXISTS "Users can view relevant projects" ON task_projects;
CREATE POLICY "Users can view relevant projects"
ON task_projects FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR user_has_tasks_in_project(auth.uid(), id)
  OR is_project_member(auth.uid(), id)
);
```

4. **Reemplazar politicas de `project_members`** para usar `is_project_creator` en vez de subconsulta a `task_projects`:

```sql
-- SELECT
DROP POLICY IF EXISTS "Users can view project members" ON project_members;
CREATE POLICY "Users can view project members"
ON project_members FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR is_project_creator(auth.uid(), project_id)
  OR user_has_tasks_in_project(auth.uid(), project_id)
);

-- INSERT
DROP POLICY IF EXISTS "Project creators can add members" ON project_members;
CREATE POLICY "Project creators can add members"
ON project_members FOR INSERT TO authenticated
WITH CHECK (is_project_creator(auth.uid(), project_id));

-- UPDATE
DROP POLICY IF EXISTS "Project creators can update members" ON project_members;
CREATE POLICY "Project creators can update members"
ON project_members FOR UPDATE TO authenticated
USING (is_project_creator(auth.uid(), project_id));

-- DELETE
DROP POLICY IF EXISTS "Project creators can delete members" ON project_members;
CREATE POLICY "Project creators can delete members"
ON project_members FOR DELETE TO authenticated
USING (is_project_creator(auth.uid(), project_id));
```

### Archivos a modificar

| Archivo | Cambios |
|---------|---------|
| Nueva migracion SQL | Crear funciones SECURITY DEFINER y reemplazar politicas RLS |

### Por que funciona

Las funciones SECURITY DEFINER se ejecutan con los privilegios del owner (superuser), lo que significa que NO pasan por las politicas RLS de la tabla que consultan. Esto rompe el ciclo de recursion mientras mantiene la seguridad de acceso.
