

## Diagnóstico: Los miembros no se guardan por políticas RLS en `project_members`

### Problema encontrado

En las network requests se ve claramente:

1. `DELETE project_members?project_id=eq.3f257a06...` → **204 OK** (borra los existentes)
2. `POST project_members` → **403 Forbidden** (no puede insertar los nuevos)

Esto significa que la tabla `project_members` tiene una política RLS que permite DELETE pero bloquea INSERT. Los miembros se borran pero nunca se re-insertan, por lo que se pierden cada vez que editas un proyecto.

### Solución

Actualizar las políticas RLS de `project_members` para permitir todas las operaciones a usuarios autenticados, igual que hicimos con `task_projects`:

```sql
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Project creators and members can manage membership" ON project_members;
DROP POLICY IF EXISTS "Project members can view other members" ON project_members;

-- Allow all authenticated users full access
CREATE POLICY "Authenticated users can manage project_members"
  ON project_members FOR ALL
  USING (true)
  WITH CHECK (true);
```

### Archivos a modificar

| Recurso | Cambio |
|---------|--------|
| Migración SQL | Reemplazar políticas RLS de `project_members` con `USING (true)` para ALL |

No se requieren cambios en el frontend.

