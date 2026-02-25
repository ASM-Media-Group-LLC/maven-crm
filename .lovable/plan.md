

## Plan: Prevenir duplicado de nombres de proyectos

### Problema
Actualmente no hay validación que impida crear dos proyectos con el mismo nombre. Tampoco se valida al renombrar un proyecto (edición inline o modal de edición).

### Solución
Agregar validación pre-inserción/pre-actualización en el hook `useProjects.ts` y en `useTareas.ts` (para la edición inline), comparando el nombre normalizado (trim + lowercase) contra los proyectos existentes.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/tareas/useProjects.ts` | En `createProject.mutationFn`: antes de insertar, consultar si ya existe un proyecto con el mismo nombre (case-insensitive via `.ilike`). Si existe, lanzar error con mensaje descriptivo. En `updateProject.mutationFn`: misma validación excluyendo el proyecto actual por ID. |
| `src/pages/tareas/useTareas.ts` | En `updateProjectInline.mutationFn`: si se actualiza el `name`, validar que no exista otro proyecto con ese nombre antes de hacer el UPDATE. |

### Detalle de implementación

En cada punto de creación/actualización:
```
const trimmedName = name.trim();
const { data: existing } = await supabase
  .from("task_projects")
  .select("id")
  .ilike("name", trimmedName)
  .neq("id", currentProjectId) // solo en update
  .limit(1);
if (existing && existing.length > 0) {
  throw new Error("DUPLICATE");
}
```

En los `onError` correspondientes, detectar el mensaje "DUPLICATE" para mostrar un toast específico: "Ya existe un proyecto con ese nombre."

No se requieren cambios en la base de datos.

