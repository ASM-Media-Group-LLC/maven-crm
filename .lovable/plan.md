

## Fix: Johanna no aparece al agregar miembros

### Causa

En `ProjectsListContent.tsx` (linea 34-41), la consulta de perfiles filtra por `company_id`. Como **ningun usuario tiene `company_id` asignado** (todos son `NULL`), el codigo cae al fallback que solo retorna el perfil del usuario actual. Por eso solo aparece "Marielby Quijada" y no "Johanna Riano".

### Solucion

Modificar la consulta para que cuando no exista `company_id`, traiga **todos los perfiles** en lugar de solo el propio. Ademas, excluir al usuario actual de la lista (no tiene sentido agregarse a uno mismo como miembro).

### Cambio en `src/pages/tareas/ProjectsListContent.tsx`

Reemplazar lineas 34-41:

```typescript
// ANTES (solo trae al usuario actual si no hay company_id)
if (profile?.company_id) {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("company_id", profile.company_id);
  return data || [];
}
return profile ? [{ id: profile.id, full_name: profile.full_name }] : [];

// DESPUES (trae todos los perfiles, filtra por company si existe)
let query = supabase.from("profiles").select("id, full_name");
if (profile?.company_id) {
  query = query.eq("company_id", profile.company_id);
}
const { data } = await query;
return (data || []).filter(p => p.id !== profile?.id);
```

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/tareas/ProjectsListContent.tsx` | Corregir query de perfiles para incluir todos los usuarios |

