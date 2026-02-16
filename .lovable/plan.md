

## Filtros avanzados en /tareas + Compartir y Archivar proyectos

### Resumen

Agregar filtros adicionales a la vista de proyectos (/tareas) para filtrar por miembro asignado y por prioridad de tareas. Ademas, agregar funcionalidad de "Compartir" (generar link publico al proyecto) y "Archivar" (cambiar estado sin eliminar) a cada proyecto.

---

### 1. Filtros adicionales en /tareas

Actualmente solo hay filtro de busqueda y filtro de estado (activo/archivado). Se agregaran:

| Filtro | Tipo | Opciones |
|--------|------|----------|
| Miembro | Select con buscador | Lista de perfiles de la compania |
| Prioridad (tareas) | Select | Baja, Media, Alta, Urgente |

**Logica de filtrado por miembro**: Un proyecto aparece si tiene al menos un miembro que coincida con el filtro seleccionado (usando la lista de `allMembers`).

**Logica de filtrado por prioridad**: Un proyecto aparece si tiene al menos una tarea con la prioridad seleccionada (usando `allTasks`).

**Archivo**: `ProjectsListContent.tsx` - agregar dos selectores nuevos entre el filtro de Estado y los toggles de vista.

---

### 2. Archivar proyectos

La tabla `task_projects` ya tiene un campo `status` con valor `active`. Se usara el valor `archived` para proyectos archivados.

**Cambios**:
- `useProjects.ts`: Actualmente filtra solo `status = 'active'`. Cambiar para traer todos los proyectos y filtrar en el frontend. Agregar mutacion `archiveProject` que hace `update({ status: 'archived' })`.
- `ProjectsListContent.tsx`: Agregar opcion "Archivar" en el dropdown de acciones del proyecto (al lado de Editar y Eliminar). Si el proyecto ya esta archivado, mostrar "Reactivar".
- `ProjectsTable.tsx`: Agregar columna "Estado" y la opcion de Archivar/Reactivar en el dropdown de acciones.
- Las KPIs de "Total Proyectos" mostraran solo los activos por defecto, a menos que el filtro de estado sea "archivado" o "todos".

---

### 3. Compartir proyectos

Implementar un enlace publico para compartir la vista resumida de un proyecto (similar a como ya funciona con tareas individuales via `share_token`).

**Cambios en base de datos**:

Agregar columna `share_token` a la tabla `task_projects`:

```sql
ALTER TABLE task_projects ADD COLUMN share_token text DEFAULT (gen_random_uuid())::text;
```

Crear funcion RPC para acceso publico (similar a `get_task_by_share_token`):

```sql
CREATE OR REPLACE FUNCTION get_project_by_share_token(_token text)
RETURNS SETOF task_projects
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM task_projects WHERE share_token = _token LIMIT 1;
$$;
```

Y una funcion para obtener las tareas del proyecto sin autenticacion:

```sql
CREATE OR REPLACE FUNCTION get_tasks_by_project_share_token(_token text)
RETURNS SETOF tasks
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT t.* FROM tasks t
  INNER JOIN task_projects p ON t.project_id = p.id
  WHERE p.share_token = _token;
$$;
```

**Cambios por archivo**:

| Archivo | Cambio |
|---------|--------|
| **Nueva migracion** | Agregar `share_token` a `task_projects` + crear las 2 funciones RPC |
| `src/pages/tareas/useProjects.ts` | Actualizar interface `TaskProject` con `share_token`. Agregar mutacion `archiveProject(id, status)`. Cambiar query para traer todos los proyectos (sin filtro de status). |
| `src/pages/tareas/ProjectsListContent.tsx` | (1) Agregar filtros de Miembro y Prioridad. (2) Agregar opciones "Archivar/Reactivar" y "Compartir" en el dropdown de cada proyecto card. (3) "Compartir" copia el link al clipboard y muestra toast. |
| `src/pages/tareas/ProjectsTable.tsx` | Agregar columna Estado. Agregar opciones "Archivar/Reactivar" y "Compartir" en el dropdown de acciones. |
| **Nuevo archivo**: `src/pages/tareas/ProjectSharePage.tsx` | Pagina publica que muestra nombre del proyecto, descripcion, y lista de tareas con su estado/prioridad/fecha. Sin autenticacion requerida. |
| `src/pages/TareaProjectShare.tsx` | Wrapper de pagina para la ruta `/tareas/share/:token`. |
| `src/App.tsx` | Agregar ruta `/tareas/share/:token` apuntando a `TareaProjectShare`. |

---

### Detalle tecnico

#### Filtros en ProjectsListContent

```text
[Buscar proyecto...]  [Estado v]  [Miembro v]  [Prioridad v]  [List] [Grid]
```

- Miembro: filtra proyectos donde el miembro seleccionado es parte del proyecto (`allMembers`).
- Prioridad: filtra proyectos que tengan al menos una tarea con esa prioridad. Se necesita extender la query de `allTasks` en `useProjects.ts` para incluir el campo `priority`.

#### Dropdown de acciones del proyecto (Grid y Table)

```text
| Editar          |
| Compartir       |  <-- nuevo, copia link
| Archivar        |  <-- nuevo, cambia status
| Eliminar        |  <-- ya existe
```

Si el proyecto esta archivado, "Archivar" se reemplaza por "Reactivar".

#### Pagina publica de proyecto

URL: `/tareas/share/:token`

Mostrara:
- Logo de la app
- Nombre y descripcion del proyecto
- Lista de tareas con: titulo, estado (badge), prioridad (badge), fecha limite
- Sin opciones de edicion (solo lectura)

#### KPIs ajustados

El KPI "Total Proyectos" contara solo los proyectos que pasan los filtros activos. Si el filtro de estado esta en "archivado", mostrara los archivados. Si no hay filtro, mostrara solo activos (comportamiento actual).

