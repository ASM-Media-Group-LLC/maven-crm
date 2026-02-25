

## Plan: Hacer todos los proyectos visibles para los 4 usuarios

### Situación actual

La política RLS de SELECT en `task_projects` solo permite ver proyectos si:
- Eres el creador (`created_by = auth.uid()`)
- Tienes tareas en el proyecto (`user_has_tasks_in_project`)
- Eres miembro del proyecto (`is_project_member`)

Por eso, si un admin crea un proyecto y no agrega a los otros como miembros, estos no lo ven.

### Problema adicional

Los 4 usuarios tienen `company_id = null`, por lo que no se puede filtrar por compañía de forma confiable ahora mismo.

### Solución propuesta

Dado que los 4 son el equipo completo y todos son admins, la solución mas simple y escalable es actualizar la política RLS de SELECT para que **todos los usuarios autenticados** puedan ver todos los proyectos:

```sql
DROP POLICY IF EXISTS "Users can view relevant projects" ON task_projects;
CREATE POLICY "Users can view relevant projects"
  ON task_projects FOR SELECT
  USING (true);
```

Esto es seguro porque:
1. La tabla ya tiene RLS habilitado (solo usuarios autenticados pasan)
2. Las políticas de UPDATE y DELETE siguen restringidas al creador/miembros
3. Es consistente con cómo funcionan otras tablas del sistema (contactos, agencias, etc.)

### Archivos a modificar

| Recurso | Cambio |
|---------|--------|
| Migración SQL | Reemplazar la política SELECT de `task_projects` con `USING (true)` |

No se requieren cambios en el frontend.

