

# Plan: Pasar miembros actuales al EditProjectModal desde TareasContent

## Problema
En `TareasContent.tsx`, el `EditProjectModal` no recibe la prop `currentMemberIds`, por lo que siempre muestra "Agregar miembros" vacío en vez de los miembros existentes del proyecto.

En `ProjectsListContent.tsx` sí se pasa correctamente:
```tsx
currentMemberIds={editProject ? allMembers.filter(m => m.project_id === editProject.id).map(m => m.user_id) : []}
```

## Cambio

**Archivo**: `src/pages/tareas/TareasContent.tsx` (línea ~605-630)

Agregar la prop `currentMemberIds` al `EditProjectModal` usando los `members` que ya están disponibles del hook `useProjectMembers(projectId)` (línea 38):

```tsx
currentMemberIds={members.map(m => m.user_id)}
```

También agregar `folders` si están disponibles, y asegurar que el `onSubmit` maneje los `memberIds` actualizados llamando a `setProjectMembers.mutate`.

## Resultado
Al abrir "Editar Proyecto" desde dentro del proyecto, se verán los miembros actuales con checkmarks y se podrán agregar/quitar.

