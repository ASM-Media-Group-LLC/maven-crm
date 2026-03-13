

## Plan: Mejoras en Tareas + Agregar Usuarios a Proyectos de Tecnología

### 1. Agregar Andrés Paredes y Jonathan Pacheco a todos los proyectos de Tecnología (Data insert)

Insertar registros en `project_members` para ambos usuarios en los 12 proyectos de la carpeta Tecnología. Usando `UPSERT` para evitar duplicados.

- **Andrés Paredes** (`4bb5a67b-f16c-4e09-bf5a-21d1c2c8f72b`)
- **Jonathan Pacheco** (`7aa4fd5c-d75b-4c2d-b681-566e4fb2f289`)
- **12 proyectos**: Biora, BluApp, Centinela, Ironkloud, LeakContent, Maven, OnePharmacy eCommerce, OnePharmacy Solutions, Ora, PicLink, Purdy, Trafix

---

### 2. Fix RLS: Admin bypass en tasks y subtasks (Migration)

Las políticas actuales de `tasks` y `subtasks` no incluyen excepción para admins. Se actualizarán las políticas SELECT, UPDATE y DELETE para agregar `OR has_role(auth.uid(), 'admin')`.

**Políticas a actualizar:**
- `tasks`: SELECT, UPDATE, DELETE
- `subtasks`: SELECT, UPDATE, DELETE, INSERT

---

### 3. Buscador en selector de asignados

**Archivo:** `src/pages/tareas/InlineAssigneeSelect.tsx`

Reemplazar la lista plana dentro del `PopoverContent` con el patrón `Command` + `CommandInput` + `CommandList` (patrón ya establecido en el proyecto). Permite filtrar usuarios por nombre al escribir.

---

### 4. Reorganizar columnas de la tabla de tareas

**Archivos:** `src/pages/tareas/TasksTable.tsx` y `src/pages/tareas/TaskListRow.tsx`

Nueva estructura de columnas:
- Título (con estado)
- **Asignado por** (nuevo — `created_by` mapeado desde `profileMap`)
- Asignado a (assignees)
- Prioridad
- Fecha de inicio (`start_at`)
- **Fecha de fin** (`due_at` como fecha legible)
- Countdown
- Estado / Acciones

En `TaskListRow.tsx` se ajustará el grid de `grid-cols-[1fr_140px_140px_100px_120px_40px]` para incluir las nuevas columnas.

En `TasksTable.tsx` se agregarán los `TableHead` y `TableCell` correspondientes.

