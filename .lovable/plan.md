

## Agregar Proyectos (Spaces) al modulo de Tareas

Se introduce una capa de "Proyectos" encima de las tareas. El flujo sera: primero crear un proyecto, luego dentro de ese proyecto crear tareas.

---

### 1. Migracion SQL - Tabla `task_projects`

Nueva tabla para almacenar los proyectos:

```sql
CREATE TABLE public.task_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  company_id uuid,
  created_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',  -- active, archived
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.task_projects ENABLE ROW LEVEL SECURITY;

-- RLS: misma logica de company_id
CREATE POLICY "Users can view company projects"
  ON public.task_projects FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ) OR created_by = auth.uid());

CREATE POLICY "Authenticated users can create projects"
  ON public.task_projects FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators can update projects"
  ON public.task_projects FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);

-- Trigger updated_at
CREATE TRIGGER update_task_projects_updated_at
  BEFORE UPDATE ON public.task_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Agregar columna project_id a tasks
ALTER TABLE public.tasks ADD COLUMN project_id uuid REFERENCES public.task_projects(id);
```

La columna `project_id` en `tasks` es nullable para no romper tareas existentes.

---

### 2. Nuevo flujo de navegacion

La pagina `/tareas` cambia a una vista de dos niveles:

- **Vista principal** (`/tareas`): Lista de proyectos como cards. Cada card muestra nombre, descripcion, cantidad de tareas activas/vencidas/completadas, y un mini-resumen.
- **Vista de proyecto** (`/tareas/:projectId`): Muestra las tareas de ese proyecto especifico (la vista actual de TaskCards + KPIs, filtrada por `project_id`).

---

### 3. Archivos nuevos

| Archivo | Proposito |
|---------|-----------|
| `src/pages/tareas/ProjectsListContent.tsx` | Vista principal: lista de proyectos con KPIs globales y boton "Nuevo Proyecto" |
| `src/pages/tareas/CreateProjectModal.tsx` | Modal para crear proyecto (nombre, descripcion) |
| `src/pages/tareas/useProjects.ts` | Hook con queries/mutations para proyectos |
| `src/pages/TareaProject.tsx` | Pagina wrapper para la vista de un proyecto especifico |

---

### 4. Archivos modificados

**`src/App.tsx`**:
- Agregar ruta protegida `/tareas/:projectId` para `TareaProject`

**`src/pages/Tareas.tsx`**:
- Cambiar contenido a `ProjectsListContent` en lugar de `TareasContent`

**`src/pages/tareas/TareasContent.tsx`**:
- Recibir `projectId` como prop
- Filtrar tareas por `project_id`
- Agregar breadcrumb o boton para volver a `/tareas`
- Mostrar nombre del proyecto en el header

**`src/pages/tareas/CreateTaskModal.tsx`**:
- Agregar `project_id` al formulario de creacion (pasado como prop, no seleccionable)

**`src/pages/tareas/useTareas.ts`**:
- Agregar `project_id` al tipo `Task`
- Filtrar query por `project_id` cuando se pasa como parametro
- Incluir `project_id` en la mutation de crear tarea

---

### 5. ProjectsListContent - Estructura

- Header: "Proyectos" + boton "Nuevo Proyecto"
- KPIs globales: Total proyectos, Proyectos activos, Total tareas pendientes
- Grid de cards de proyecto, cada una con:
  - Nombre del proyecto
  - Descripcion (truncada)
  - Mini contadores: X activas, X vencidas, X completadas
  - Click en la card navega a `/tareas/{projectId}`

---

### 6. CreateProjectModal

Campos:
- Nombre (text, requerido)
- Descripcion (textarea, opcional)

Al crear:
- Inserta con `created_by = auth.uid()`, `company_id` del perfil
- Toast de confirmacion
- Recarga la lista

---

### 7. Seccion tecnica

- `useProjects.ts` usa `@tanstack/react-query` con el mismo patron de `useTareas`
- Las queries de tareas por proyecto usan `.eq("project_id", projectId)` como filtro adicional
- La TaskSharePage no cambia (sigue funcionando con share_token individual)
- El sidebar sigue apuntando a `/tareas` (que ahora muestra proyectos)
