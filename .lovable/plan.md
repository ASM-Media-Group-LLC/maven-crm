

## Plan: Corregir asignación en Closers

### Problemas identificados

1. **Dropdown solo muestra closers**: `AssignCloserDialog.tsx` (línea 38) filtra `user_roles` por `role = 'closer'`. Admins y supervisores no aparecen en la lista y no pueden asignarse a sí mismos.

2. **RLS bloquea updates**: Solo admins tienen policy de UPDATE en `closer_creators`. Managers solo tienen SELECT. Supervisores no tienen ninguna política. Esto causa que la asignación falle silenciosamente para cualquier rol que no sea admin.

### Cambios

**1. `AssignCloserDialog.tsx` — Ampliar query de usuarios asignables (líneas 36-47)**

Cambiar la query para incluir roles `closer`, `admin` y `supervisor`:
```ts
const { data, error } = await supabase
  .from("user_roles")
  .select("user_id")
  .in("role", ["closer", "admin", "supervisor"]);
```

**2. Migración SQL — Agregar políticas RLS faltantes**

```sql
-- Supervisores: SELECT + UPDATE en closer_creators
CREATE POLICY "Supervisors can view all closer_creators"
  ON public.closer_creators FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "Supervisors can update closer_creators"
  ON public.closer_creators FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'))
  WITH CHECK (public.has_role(auth.uid(), 'supervisor'));

-- Managers: UPDATE en closer_creators (ya tienen SELECT)
CREATE POLICY "Managers can update closer_creators"
  ON public.closer_creators FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'manager'));
```

### Resumen

| Archivo | Cambio |
|---------|--------|
| `AssignCloserDialog.tsx` | Query `.in("role", ["closer","admin","supervisor"])` |
| Migración SQL | 3 nuevas políticas RLS (supervisor SELECT+UPDATE, manager UPDATE) |

