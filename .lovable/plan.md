

## Plan: Auto-ocultar stats cards en scroll para LeadGen y Closers

### Contexto
LeadGen ya tiene el patrón `statsCollapsed` implementado. Closers no lo tiene — las `ClosersKPICards` están dentro de un `div.shrink-0` fijo que nunca se oculta.

### Cambios

#### 1. `ClosersContent.tsx` — Aplicar el mismo patrón de LeadGen
- Agregar `useState(false)` para `statsCollapsed` y `useRef` + `useCallback` para `handleContentScroll`
- Extraer `ClosersKPICards` fuera del bloque `shrink-0` que contiene tabs+filtros, envolverlo en un div con `transition-all duration-300 overflow-hidden` y clases condicionales (`max-h-0 opacity-0` vs `max-h-[200px] opacity-100`)
- Añadir `onScroll={handleContentScroll}` al contenedor scrollable de la tabla (el div `flex-1 min-h-0`)

#### 2. `LeadGenContent.tsx` — Verificar que el scroll listener esté correctamente conectado
El patrón ya existe (línea 111-115). Confirmar que el `onScroll` handler está en el contenedor correcto para que funcione con el layout actual.

### Archivos a modificar
- `src/pages/closers/ClosersContent.tsx` — agregar auto-hide de KPI cards en scroll
- `src/pages/leadgen/LeadGenContent.tsx` — verificar/ajustar si el scroll handler necesita reubicación

