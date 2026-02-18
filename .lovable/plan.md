

## Project Roadmap - Tracker de Progreso de la Plataforma

### Descripcion

Nueva pagina `/roadmap` en la seccion de Recursos del sidebar que permite visualizar y gestionar el progreso de construccion de toda la plataforma MAVEN. Inspirado en la imagen de referencia, mostrara categorias colapsables con tareas individuales que se pueden marcar como completadas, junto con una barra de progreso general.

---

### Estructura Visual

**Header:**
- Titulo "Project Roadmap" con descripcion
- Tarjeta de progreso general con barra de progreso y contadores por estado (Done, In Progress, To Do, Blocked)
- Porcentaje total calculado automaticamente

**Tabla por categorias:**
- Secciones colapsables (ej: "Core Platform and Auth", "Gestion de Creadoras", "Recursos Humanos", "Contabilidad")
- Cada seccion muestra contador de tareas completadas y mini barra de progreso
- Filas con: checkbox, submodulo, tarea (con descripcion opcional), estado (Done/In Progress/To Do/Blocked), fecha estimada

**Formulario inline:**
- Boton para agregar nueva categoria
- Boton para agregar nueva tarea dentro de cada categoria
- Estados editables con click (ciclo entre To Do, In Progress, Done, Blocked)

---

### Persistencia en Supabase

**Tabla `roadmap_categories`:**
- `id` (uuid, PK)
- `name` (text, NOT NULL) - Nombre de la categoria
- `position` (integer) - Orden
- `created_at` (timestamptz)

**Tabla `roadmap_items`:**
- `id` (uuid, PK)
- `category_id` (uuid, FK a roadmap_categories)
- `submodule` (text) - Nombre del submodulo
- `task` (text, NOT NULL) - Descripcion de la tarea
- `description` (text, nullable) - Nota adicional
- `status` (text) - "done", "in_progress", "todo", "blocked"
- `delivery_date` (date, nullable) - Fecha estimada
- `position` (integer) - Orden dentro de la categoria
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

RLS: Politica permisiva (ALL con true) igual que otras tablas operativas del proyecto.

---

### Archivos a crear/modificar

1. **Migracion SQL** - Crear tablas `roadmap_categories` y `roadmap_items` con RLS
2. **`src/pages/Roadmap.tsx`** - Pagina wrapper con sidebar y topbar
3. **`src/pages/roadmap/RoadmapContent.tsx`** - Componente principal con:
   - Header y tarjeta de progreso general
   - Secciones colapsables por categoria
   - Filas de items con checkbox, estado, fecha
   - Formularios inline para agregar categorias e items
4. **`src/pages/roadmap/useRoadmap.ts`** - Hook con queries y mutations para CRUD de categorias e items
5. **`src/App.tsx`** - Agregar ruta `/roadmap` protegida
6. **`src/components/dashboard/DashboardSidebar.tsx`** - Agregar enlace "Roadmap" en la seccion Recursos

---

### Seccion tecnica

**Progreso general:** Calculado como `(items con status "done") / (total items) * 100`. Los contadores Done, In Progress, To Do y Blocked se derivan filtrando `roadmap_items` por status.

**Checkbox:** Al hacer click en el checkbox de una fila, se alterna entre "done" y "todo". El estado se persiste con un `update` a Supabase y se invalida la query.

**Agregar items:** Input inline dentro de cada categoria colapsable. Al presionar Enter o el boton, se inserta en `roadmap_items` con `category_id` correspondiente y status "todo".

**Agregar categorias:** Input + boton en la parte inferior. Inserta en `roadmap_categories`.

**Cambio de estado:** Click en el badge de estado cicla entre todo, in_progress, done, blocked. Cada cambio se persiste inmediatamente.

**Patron visual:** Secciones colapsables usando `Collapsible` de Radix. Cada seccion muestra `X/Y tasks` y una mini barra `Progress`. Colores semanticos: verde para Done, amarillo para In Progress, gris para To Do, rojo para Blocked.

**Pre-poblado:** La migracion incluira datos iniciales con los modulos ya construidos (Dashboard, Contactos, Creadores, Eventos, LeadGen, Closers, Tickets, Promolog, Tareas, Sales, Design System, Docs, Auth, Admin) marcados como "done", y los pendientes (RRHH, Contabilidad, Onboarding de Modelos, Contenido Personalizado) como "todo".

