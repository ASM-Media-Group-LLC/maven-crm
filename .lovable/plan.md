

## Mejoras completas al modulo de Tareas y Proyectos

Cuatro bloques de cambios: CRUD completo, vistas grid/lista, notificaciones por correo, y visibilidad restringida.

---

### 1. Migracion SQL

**Permitir DELETE en proyectos y tareas** (actualmente bloqueado por falta de policies):

```sql
-- DELETE policy para task_projects
CREATE POLICY "Creators can delete projects"
  ON public.task_projects FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- DELETE policy para tasks
CREATE POLICY "Assigned users can delete tasks"
  ON public.tasks FOR DELETE TO authenticated
  USING (auth.uid() = assigned_to OR auth.uid() = created_by);
```

No se necesitan cambios de esquema adicionales; las columnas existentes ya soportan edicion.

---

### 2. Editar y Eliminar - Proyectos

**Archivos nuevos:**

| Archivo | Proposito |
|---------|-----------|
| `src/pages/tareas/EditProjectModal.tsx` | Modal para editar nombre y descripcion de un proyecto |
| `src/pages/tareas/DeleteProjectDialog.tsx` | AlertDialog de confirmacion para eliminar un proyecto |

**Archivos modificados:**

- **`useProjects.ts`**: Agregar mutations `updateProject` y `deleteProject`
- **`ProjectsListContent.tsx`**: Agregar menu de acciones (3 puntos) en cada card de proyecto con opciones Editar y Eliminar. Agregar estados para el proyecto seleccionado y modales abiertos

---

### 3. Editar y Eliminar - Tareas

**Archivos nuevos:**

| Archivo | Proposito |
|---------|-----------|
| `src/pages/tareas/EditTaskModal.tsx` | Modal para editar titulo, descripcion, asignado, y plazo (misma estructura que CreateTaskModal) |
| `src/pages/tareas/DeleteTaskDialog.tsx` | AlertDialog de confirmacion para eliminar una tarea |

**Archivos modificados:**

- **`useTareas.ts`**: Agregar mutations `updateTask` y `deleteTask`
- **`TaskCard.tsx`**: Agregar boton de menu (MoreHorizontal) con opciones Editar y Eliminar
- **`TareasContent.tsx`**: Agregar estados para manejar la tarea seleccionada para edicion/eliminacion, y renderizar los modales correspondientes

---

### 4. Vista Grid y Lista - Proyectos

**Archivos nuevos:**

| Archivo | Proposito |
|---------|-----------|
| `src/pages/tareas/ProjectsTable.tsx` | Vista de tabla/lista para proyectos con columnas: nombre, descripcion, activas, vencidas, completadas, acciones |

**Archivos modificados:**

- **`ProjectsListContent.tsx`**: Agregar toggle de vista (LayoutGrid / List icons) en el header. Estado `viewMode` ("grid" | "list"). Renderizar condicionalmente el grid actual o `ProjectsTable`. Todas las columnas de la tabla deben ser ordenables

---

### 5. Vista Grid y Lista - Tareas

**Archivos nuevos:**

| Archivo | Proposito |
|---------|-----------|
| `src/pages/tareas/TasksTable.tsx` | Vista de tabla/lista para tareas con columnas: titulo, asignado, countdown, estado, acciones |

**Archivos modificados:**

- **`TareasContent.tsx`**: Agregar toggle de vista (LayoutGrid / List) en el header junto al boton "Nueva Tarea". Estado `viewMode`. Renderizar condicionalmente el grid de TaskCards o `TasksTable`. Todas las columnas ordenables

---

### 6. Notificacion por correo al asignar tarea

Se necesita un servicio de email. Se usara **Resend** mediante una edge function.

**Paso 1 - Secret**: Solicitar al usuario su API key de Resend (servicio gratuito hasta 100 emails/dia).

**Paso 2 - Edge Function**: `supabase/functions/send-task-notification/index.ts`
- Recibe: `assignee_email`, `assignee_name`, `task_title`, `task_url`
- Envia email usando Resend API con el link directo a la tarea en Maven
- Template HTML sencillo con el nombre de la tarea, quien la asigno, y un boton "Ver tarea"

**Paso 3 - Config**: Agregar en `supabase/config.toml`:
```toml
[functions.send-task-notification]
verify_jwt = false
```

**Paso 4 - Integracion**: En `useTareas.ts`, despues de crear una tarea exitosamente, invocar la edge function pasando el email del usuario asignado. Se necesita obtener el email del perfil asignado (agregar `.select("id, full_name, email")` o hacer un lookup por el user id en la tabla profiles... dado que profiles no tiene email, se usara la tabla auth.users via una query server-side en la edge function).

**Flujo del email:**
```text
Usuario crea tarea
  -> Insert en tasks (cliente)
  -> onSuccess: llama edge function con task info + assigned_to UUID
  -> Edge function: busca email del usuario via service_role
  -> Envia email con Resend
  -> Link: https://id-preview--0348f493-dea7-496d-ba25-7e88aacd10ab.lovable.app/tareas/{projectId}
```

---

### 7. Visibilidad restringida por usuario

Los usuarios solo deben ver sus tareas asignadas y los proyectos donde tienen tareas.

**RLS de tasks**: Ya filtra por `assigned_to` o `created_by` - correcto.

**RLS de task_projects**: Actualmente filtra por `company_id` lo cual muestra TODOS los proyectos de la empresa. Para restringir a solo proyectos relevantes:

Opcion: Crear una funcion security definer que verifica si el usuario tiene tareas en el proyecto:

```sql
CREATE OR REPLACE FUNCTION public.user_has_tasks_in_project(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE project_id = _project_id
    AND (assigned_to = _user_id OR created_by = _user_id)
  )
$$;
```

Actualizar la policy SELECT de `task_projects`:
```sql
DROP POLICY "Users can view company projects" ON public.task_projects;
CREATE POLICY "Users can view relevant projects"
  ON public.task_projects FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.user_has_tasks_in_project(auth.uid(), id)
  );
```

Esto asegura que un usuario solo ve proyectos que creo o donde tiene tareas asignadas.

**En el frontend**: Los queries de `useProjects.ts` y `useTareas.ts` ya consultan directamente a Supabase, por lo que RLS hara el filtrado automaticamente sin cambios de codigo.

---

### 8. Resumen de archivos

**Nuevos (6):**
- `src/pages/tareas/EditProjectModal.tsx`
- `src/pages/tareas/DeleteProjectDialog.tsx`
- `src/pages/tareas/ProjectsTable.tsx`
- `src/pages/tareas/EditTaskModal.tsx`
- `src/pages/tareas/DeleteTaskDialog.tsx`
- `src/pages/tareas/TasksTable.tsx`
- `supabase/functions/send-task-notification/index.ts`

**Modificados (6):**
- `src/pages/tareas/useProjects.ts` - mutations update/delete
- `src/pages/tareas/useTareas.ts` - mutations update/delete + llamada a edge function
- `src/pages/tareas/ProjectsListContent.tsx` - toggle vista, modales editar/eliminar
- `src/pages/tareas/TareasContent.tsx` - toggle vista, modales editar/eliminar
- `src/pages/tareas/TaskCard.tsx` - menu de acciones
- `supabase/config.toml` - nueva funcion

**Migracion SQL**: DELETE policies + funcion security definer + policy actualizada

