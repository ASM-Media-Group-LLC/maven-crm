

## Plan: Optimizar rendimiento de Closers y documentar estándar de tablas en Design System

### Problema 1: /closers carga lento

La query principal en `useCloserLeads.ts` hace **3 queries secuenciales** en cada fetch:
1. Fetch de `closer_creators` (paginada)
2. Fetch de `profiles` para agent names
3. Fetch de `closer_contact_history` para contact counts

Estas 3 queries se ejecutan en serie dentro de un solo `queryFn`, bloqueando el render. Además, el `PAGE_SIZE` es 100, innecesariamente alto.

**Solución**:
- Reducir `PAGE_SIZE` de 100 a 50 (consistente con Contactos)
- Ejecutar las queries de `profiles` y `contact_history` en **paralelo** con `Promise.all` en vez de secuencial
- Agregar `staleTime: 30_000` a la query principal para evitar refetches innecesarios

### Problema 2: Tablas inconsistentes entre vistas

Contactos y Closers usan patrones de tabla diferentes: headers distintos, estilos de sticky distintos, estructura de columnas sin un estándar documentado. El Design System actual tiene un ejemplo genérico de tabla pero no documenta el patrón real de DataTableShell + sticky headers + columnas estándar.

**Solución**: Crear una nueva sección **"Data Table Pattern"** en el Design System (dentro de `LayoutPatternsSection.tsx` o como nueva sección en `DataDisplaySection.tsx`) que documente:

1. **Estructura de página con tabla** — el layout ContactosContent como referencia canónica
2. **Patrón de headers sticky** — la clase estándar: `sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]`
3. **Columna de acciones sticky** — `sticky right-0 z-30 bg-card`
4. **Orden de columnas estándar** — #, Creación, Handle, Agente/Creado por, Estado (si aplica), Categoría, Contacto, Notas, Acciones
5. **DataTableShell** — modo internal scroll (`className="flex-1 min-h-0"`)
6. **Código de referencia** — snippet de ContactosTable como ejemplo canónico

### Cambios

#### 1. `src/pages/closers/hooks/useCloserLeads.ts` — Rendimiento
- Cambiar `PAGE_SIZE` de 100 a 50
- En el branch "all other tabs" (líneas 174-248): ejecutar fetch de `profiles` y `closer_contact_history` en paralelo con `Promise.all`
- Agregar `staleTime: 30_000` a la query principal

#### 2. `src/pages/design-system/sections/DataDisplaySection.tsx` — Documentar patrón de tablas
Agregar subsección **"Data Table Standard"** con:
- Diagrama visual del layout (header fijo, tabla con scroll, paginador fijo)
- Snippet de código mostrando la estructura canónica (ContactosTable como modelo)
- Tabla de clases CSS estándar para headers sticky, acciones sticky, empty state
- Reglas: orden de columnas, uso de DataTableShell, SortHeader pattern
- Referencia a los componentes inline editables (InlineCategorySelect, InlineStageSelect) para tablas de gestión

### Archivos a modificar
1. **`src/pages/closers/hooks/useCloserLeads.ts`** — PAGE_SIZE, Promise.all, staleTime
2. **`src/pages/design-system/sections/DataDisplaySection.tsx`** — nueva subsección "Data Table Standard"

### Resultado
- /closers cargará notablemente más rápido (queries en paralelo + menos filas)
- El Design System tendrá documentación clara del patrón de tabla que sirve como referencia para mantener consistencia en todas las vistas

