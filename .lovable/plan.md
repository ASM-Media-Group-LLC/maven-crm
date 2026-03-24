

## Plan: Default a mostrar todos los registros sin filtros previos

### Problema
En `/closers`, el tab por defecto es `"asignadas"` para usuarios normales (solo se redirige a `"todas"` si es admin/manager). El usuario quiere que **todos los módulos muestren todos los registros por defecto**, sin filtros preseleccionados.

### Análisis por módulo
- **Closers**: default `"asignadas"` → debe ser `"todas"`
- **LeadGen**: default `"leads"` → ya muestra todos, correcto
- **Contactos**: default sin filtros de estado → ya muestra todos, correcto

El único cambio real necesario es en **Closers**.

### Cambios

#### `src/pages/closers/hooks/useCloserLeads.ts`
- Cambiar `useState("asignadas")` → `useState("todas")`

#### `src/pages/closers/ClosersContent.tsx`
- Eliminar el `useEffect` que redirige admins de `"asignadas"` a `"todas"` (ya no necesario porque el default ya es `"todas"`)

### Archivos
1. `src/pages/closers/hooks/useCloserLeads.ts` — línea 98: default tab a `"todas"`
2. `src/pages/closers/ClosersContent.tsx` — eliminar useEffect de redirección (líneas ~56-59)

