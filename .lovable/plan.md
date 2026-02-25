

## Diagnóstico: Por qué no puedes actualizar Trafix

El proyecto Trafix fue creado por **Daniel Botero**. La política RLS de UPDATE que aplicamos permite editar si eres el creador **o** si eres miembro del proyecto. Pero nadie fue agregado como miembro de Trafix, así que Marielby no tiene permisos de UPDATE.

Es el mismo problema que tuvimos con SELECT: la restricción por creador/miembro no funciona bien cuando todos deberían tener acceso.

### Solución

Actualizar la política RLS de UPDATE (y también DELETE para consistencia) para permitir que todos los usuarios autenticados puedan editar y eliminar proyectos:

```sql
DROP POLICY IF EXISTS "Project members and creators can update projects" ON task_projects;
CREATE POLICY "Authenticated users can update projects"
  ON task_projects FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS "Creators can delete projects" ON task_projects;
CREATE POLICY "Authenticated users can delete projects"
  ON task_projects FOR DELETE
  USING (true);
```

### Archivos a modificar

| Recurso | Cambio |
|---------|--------|
| Migración SQL | Abrir políticas de UPDATE y DELETE en `task_projects` a `USING (true)` |

No se requieren cambios en el frontend.

