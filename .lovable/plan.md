

## Plan: Sistema de Carpetas para Proyectos de Tareas

### Objetivo
Agregar un sistema de carpetas (categorías) para agrupar proyectos. Por ejemplo, crear una carpeta "Tecnología" que contenga varios proyectos relacionados.

### Cambios en Base de Datos

**Nueva tabla `project_folders`:**
```sql
CREATE TABLE public.project_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company_id uuid REFERENCES companies(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
```

**Nueva columna en `task_projects`:**
```sql
ALTER TABLE public.task_projects ADD COLUMN folder_id uuid REFERENCES project_folders(id) ON DELETE SET NULL;
```

RLS: lectura abierta para autenticados, escritura solo admin.

### Cambios en Frontend

**1. `useProjects.ts`**
- Agregar query para `project_folders`
- Agregar mutations: `createFolder`, `renameFolder`, `deleteFolder`
- Incluir `folder_id` en las queries de proyectos

**2. `ProjectsListContent.tsx`**
- Agregar filtro por carpeta en la barra de filtros
- Vista grid: agrupar proyectos por carpeta con headers colapsables (carpeta como sección). Los proyectos sin carpeta aparecen en una sección "Sin carpeta"
- Agregar botón "Nueva Carpeta" junto a "Nuevo Proyecto"
- Permitir asignar/mover proyectos a carpetas desde el menú de acciones (DropdownMenu)

**3. `ProjectsTable.tsx` (vista lista)**
- Agrupar filas por carpeta con row headers
- Misma lógica de agrupación

**4. Nuevos componentes**
- `CreateFolderModal.tsx`: Modal simple con nombre de carpeta
- `MoveFolderSelect.tsx`: Selector para mover un proyecto a una carpeta (integrado en el dropdown de acciones del proyecto)

**5. `CreateProjectModal.tsx` y `EditProjectModal.tsx`**
- Agregar selector de carpeta opcional al crear/editar un proyecto

### Flujo de Usuario
1. Crea una carpeta "Tecnología"
2. Crea proyectos o mueve proyectos existentes a esa carpeta
3. En la vista de proyectos, ve las carpetas como secciones colapsables con sus proyectos dentro
4. Puede filtrar por carpeta específica

