

## Asignar tareas y subtareas a cualquier usuario del sistema

### Problema

Actualmente, tanto en tareas como en subtareas, la lista de usuarios disponibles para asignar se obtiene filtrando por `company_id`. Como ningun usuario tiene `company_id` configurado, el sistema solo muestra al usuario actual, impidiendo asignar tareas a otros miembros del equipo.

Esto ocurre en dos lugares:
1. **Tareas** (`useTareas.ts`, linea 78-91): la query de `companyProfiles` cae al fallback de un solo usuario.
2. **Subtareas** (`SubtasksPanel.tsx`, lineas 48-62): la misma logica de fallback en `fetchedProfiles`.

### Solucion

Aplicar la misma correccion que ya se hizo en `ProjectsListContent.tsx`: cuando no hay `company_id`, traer todos los perfiles del sistema.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/tareas/useTareas.ts` | Modificar la query `companyProfiles` (lineas 80-89) para que traiga todos los perfiles cuando no hay `company_id` |
| `src/pages/tareas/SubtasksPanel.tsx` | Modificar la query `fetchedProfiles` (lineas 48-62) para que traiga todos los perfiles cuando no hay `company_id` |

### Detalle del cambio

En ambos archivos, reemplazar el patron:

```typescript
// ANTES
if (profile?.company_id) {
  const { data } = await supabase.from("profiles").select("id, full_name").eq("company_id", profile.company_id);
  return data || [];
}
return profile ? [{ id: profile.id, full_name: profile.full_name }] : [];

// DESPUES
let query = supabase.from("profiles").select("id, full_name");
if (profile?.company_id) {
  query = query.eq("company_id", profile.company_id);
}
const { data } = await query;
return data || [];
```

Esto permite que todos los usuarios aparezcan en los selectores de asignacion, tanto para tareas principales como para subtareas, habilitando la gestion colaborativa completa.
