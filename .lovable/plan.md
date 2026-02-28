

## Reemplazar Whaticket por "Personalizados" (solicitudes de contenido personalizado)

### Resumen

Se eliminara la funcionalidad de Whaticket (pagina, sidebar link, hook) y se reemplazara con una nueva seccion "Personalizados" dentro de Creadores. Esta seccion permitira crear solicitudes de contenido personalizado y ver/gestionar las existentes.

---

### 1. Crear tabla en Supabase

Nueva tabla `custom_content_requests`:

```text
id             UUID (PK, default gen_random_uuid())
creator_id     UUID (FK -> creators.id, nullable)
title          TEXT NOT NULL
description    TEXT
content_type   TEXT NOT NULL (ej: "foto", "video", "audio", "otro")
status         TEXT DEFAULT 'pendiente' (pendiente, en_progreso, completado, cancelado)
priority       TEXT DEFAULT 'normal' (baja, normal, alta, urgente)
requested_by   UUID (FK -> profiles.id)
notes          TEXT
due_date       DATE (nullable)
completed_at   TIMESTAMPTZ (nullable)
created_at     TIMESTAMPTZ DEFAULT now()
updated_at     TIMESTAMPTZ DEFAULT now()
```

Con politicas RLS para usuarios autenticados y trigger `update_updated_at_column`.

---

### 2. Crear pagina `/creadores/personalizados`

Nuevo archivo `src/pages/creadores/personalizados/PersonalizadosPage.tsx`:

- **KPI Cards**: Total solicitudes, Pendientes, En progreso, Completadas
- **Filtros**: Busqueda por titulo/creadora, filtro por estado, filtro por tipo de contenido
- **Tabla**: Lista de solicitudes con columnas: titulo, creadora, tipo, estado, prioridad, fecha, acciones
- **Modal "Nueva Solicitud"**: Formulario con campos de titulo, descripcion, tipo de contenido, creadora (combobox searchable), prioridad, fecha limite
- **Modal "Ver/Editar"**: Para ver detalle y actualizar estado/notas

Seguira el mismo patron de layout que las demas paginas de creadores (SidebarProvider + DashboardSidebar + DashboardTopbar).

---

### 3. Actualizar Sidebar

En `src/components/dashboard/DashboardSidebar.tsx`:

- Cambiar `creadoresPersonalizados` de `{ title: "Whaticket", url: "/whaticket" }` a `{ title: "Personalizados", url: "/creadores/personalizados" }`
- Eliminar la sub-seccion visual "Personalizados" como grupo separado; en su lugar, agregar "Personalizados" como un item mas dentro de `creadoresSubItems` (quinto item despues de Listado)
- Eliminar el separador y label "Personalizados" del JSX

---

### 4. Actualizar rutas en App.tsx

- Eliminar la ruta `/whaticket` y el import de `WhaticketPage`
- Agregar ruta `/creadores/personalizados` con el nuevo `PersonalizadosPage`

---

### 5. Limpiar archivos de Whaticket

- **No eliminar**: `src/hooks/useWhaticketLink.ts` ni las referencias en `InfoTabContent.tsx` / `ViewCreadorModal.tsx` (esos muestran el link de Whaticket en el perfil de la creadora, que es funcionalidad independiente y util)
- **Eliminar**: `src/pages/WhaticketPage.tsx` (se vaciara/reemplazara)

---

### Detalles tecnicos

**Archivos a crear:**
- `src/pages/creadores/personalizados/PersonalizadosPage.tsx` - Pagina principal
- `src/pages/creadores/personalizados/NewRequestModal.tsx` - Modal de nueva solicitud
- `src/pages/creadores/personalizados/ViewRequestModal.tsx` - Modal de ver/editar
- `src/pages/creadores/personalizados/useCustomRequests.ts` - Hook de datos

**Archivos a modificar:**
- `src/components/dashboard/DashboardSidebar.tsx` - Actualizar navegacion
- `src/App.tsx` - Actualizar rutas

**Archivos a eliminar/vaciar:**
- `src/pages/WhaticketPage.tsx` - Ya no se necesita como pagina independiente

