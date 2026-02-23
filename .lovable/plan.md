

## Incluirse como miembro + Notificacion al asignar

### Cambios

#### 1. Incluirse a si misma en la lista de miembros

En `ProjectsListContent.tsx` (linea 39), actualmente se excluye al usuario actual con `.filter(p => p.id !== profile?.id)`. Se eliminara ese filtro para que el usuario actual tambien aparezca en la lista de miembros seleccionables.

#### 2. Notificacion al asignar miembros a un proyecto

Cuando se crea o edita un proyecto y se agregan miembros, se insertara una notificacion en la tabla `notifications` para cada miembro nuevo. La tabla `notifications` ya existe con los campos necesarios (`user_id`, `type`, `title`, `message`, `reference_id`, `reference_type`).

---

### Detalle tecnico

| Archivo | Cambio |
|---------|--------|
| `src/pages/tareas/ProjectsListContent.tsx` | Quitar el `.filter(p => p.id !== profile?.id)` de la query de perfiles (linea 39) |
| `src/pages/tareas/useProjects.ts` | En `createProject` y `updateProject`, despues de insertar miembros, insertar notificaciones en la tabla `notifications` para cada miembro agregado |

#### Formato de la notificacion

```
type: "project_assignment"
title: "Te asignaron a un proyecto"
message: "Fuiste agregado(a) al proyecto '{nombre}'"
reference_id: project_id
reference_type: "project"
user_id: id del miembro asignado
```

No se requieren migraciones de base de datos. La tabla `notifications` ya tiene una policy de INSERT permisiva para usuarios autenticados, y los usuarios pueden ver sus propias notificaciones (policy de SELECT filtra por `user_id`).

