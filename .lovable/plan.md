

## Plan: Líder de proyecto y barra de progreso

### 1. Migración de base de datos

Agregar columna `leader_id` (UUID, nullable) a la tabla `task_projects` que referencia a `profiles.id`:

```sql
ALTER TABLE task_projects ADD COLUMN leader_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
```

### 2. Actualizar tipo `TaskProject`

En `useProjects.ts`, agregar `leader_id: string | null` al interface `TaskProject`.

### 3. Función helper de progreso

En `useProjects.ts`, agregar una función `getProjectProgress(projectId)` que retorne el porcentaje de tareas completadas vs total:

```text
total = pending + in_progress + paused + overdue + completed
progress = total > 0 ? Math.round((completed / total) * 100) : 0
```

### 4. Modales de creación y edición

#### `CreateProjectModal.tsx`
- Agregar un `Select` para elegir líder del proyecto entre los perfiles disponibles (opcional).
- Pasar `leaderId` en el submit.

#### `EditProjectModal.tsx`
- Mismo `Select` de líder, inicializado con el valor actual del proyecto.
- Pasar `leaderId` en el submit.

### 5. Mutaciones en `useProjects.ts`

- `createProject`: incluir `leader_id` en el insert.
- `updateProject`: incluir `leader_id` en el update.

### 6. Vista de cards (grid) en `ProjectsListContent.tsx`

- Mostrar el nombre del líder debajo de la descripción del proyecto con un icono de corona/shield.
- Agregar componente `Progress` (de `@/components/ui/progress`) debajo de los conteos de tareas.
- El progreso se calcula con `getProjectProgress`.

### 7. Vista de tabla en `ProjectsTable.tsx`

- Agregar columna "Líder" que muestre el nombre del líder.
- Agregar columna "Progreso" con la barra de progreso y el porcentaje.

### 8. Vista interna del proyecto (`TareasContent.tsx`)

- Mostrar el líder y la barra de progreso en el header del proyecto, junto al nombre y descripción.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| **Migración SQL** | Agregar columna `leader_id` a `task_projects` |
| `src/pages/tareas/useProjects.ts` | Tipo + `getProjectProgress` + mutations con `leader_id` |
| `src/pages/tareas/CreateProjectModal.tsx` | Select de líder |
| `src/pages/tareas/EditProjectModal.tsx` | Select de líder |
| `src/pages/tareas/ProjectsListContent.tsx` | Progress bar + líder en cards |
| `src/pages/tareas/ProjectsTable.tsx` | Columnas líder + progreso |
| `src/pages/tareas/TareasContent.tsx` | Líder + progreso en header del proyecto |

