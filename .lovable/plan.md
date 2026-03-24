

## Plan: Mostrar todos los leads por defecto en /leadgen

### Problema
El estado inicial de `dateFrom` y `dateTo` es `new Date()` (hoy), por lo que la query solo trae los leads del día actual. Por eso no salen todos los registros.

### Solución

#### `src/pages/leadgen/LeadGenContent.tsx`
- Cambiar las líneas 64-65:
  - `useState<Date | undefined>(new Date())` → `useState<Date | undefined>(undefined)`
  - Para ambos: `dateFrom` y `dateTo`
- Esto hace que al cargar la página, `dateFromStr` y `dateToStr` sean `undefined`, y la query en `fetchEntriesByDateRange` omite el filtro de fecha, trayendo **todos** los leads paginados

### Resultado
Al entrar a `/leadgen`, se mostrarán todos los leads sin filtro de fecha. Cuando el usuario seleccione un rango de fechas, se aplicará el filtro.

### Archivo
1. `src/pages/leadgen/LeadGenContent.tsx` — cambiar default de `dateFrom`/`dateTo` a `undefined`

