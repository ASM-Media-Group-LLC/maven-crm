

## Plan: Edición inline del nombre, descripción y líder del proyecto

### Contexto actual

En `TareasContent.tsx` (la vista interna del proyecto), el header muestra:
- **Nombre** del proyecto como `<h1>` estático (línea 129)
- **Descripción** como `<p>` estático (línea 137)
- **Líder** como texto estático con icono de corona (líneas 140-147)

Los datos vienen de `useTareas` que expone `projectName`, `projectDescription` y `projectLeaderId`. No existe actualmente una mutación para actualizar el proyecto desde `useTareas`.

### Cambios propuestos

**1. `src/pages/tareas/useTareas.ts`** — Agregar mutación `updateProjectInline`
- Nueva mutación que hace UPDATE a `task_projects` para los campos `name`, `description` y `leader_id`
- Invalida las queries relevantes (`task-project-detail`, `task-projects`)

**2. `src/pages/tareas/TareasContent.tsx`** — Hacer editables los 3 campos del header

| Campo | Comportamiento inline |
|-------|----------------------|
| **Nombre** | Click en el `<h1>` lo convierte en `<Input>`. Se guarda con Enter o blur. Escape cancela. |
| **Descripción** | Click en el `<p>` lo convierte en `<Input>` (o muestra placeholder "Agregar descripción..." si está vacío). Se guarda con Enter o blur. |
| **Líder** | Click en el nombre/texto del líder abre un `<Select>` inline con la lista de `companyProfiles`. Seleccionar guarda inmediatamente. |

Cada campo usará un estado local (`editingName`, `editingDescription`, `editingLeader`) para controlar cuándo está en modo edición. Al guardar, se llama a `updateProjectInline.mutate()` con solo el campo modificado.

### Detalles de UX
- Hover sobre cada campo mostrará un cursor de edición y un sutil ícono de lápiz
- El nombre no puede quedar vacío (validación antes de guardar)
- La descripción puede quedar vacía (se borra)
- El líder puede ser "Sin líder" (se guarda como `null`)

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/tareas/useTareas.ts` | Agregar mutación `updateProjectInline` y exponerla en el return |
| `src/pages/tareas/TareasContent.tsx` | Reemplazar header estático con componentes editables inline |

No se requieren cambios en la base de datos.

