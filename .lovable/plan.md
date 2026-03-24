

## Plan: Restaurar filtro de fecha por defecto a "hoy" en LeadGen

### Problema
Al cambiar `dateFrom`/`dateTo` a `undefined`, la query trae TODOS los leads históricos (80K+) sin filtro de fecha. Los 194 leads de hoy se "pierden" en las primeras 2 páginas de un dataset enorme, y los KPIs solo reflejan los 100 de la página actual.

La solicitud anterior de "mostrar todos los leads" se refería a no filtrar por usuario/rol, no a quitar el filtro de fecha. Para una herramienta de operaciones diarias, el default lógico es mostrar los leads del día.

### Solución

#### `src/pages/leadgen/LeadGenContent.tsx`
- Restaurar `dateFrom` y `dateTo` a `new Date()` como valor por defecto
- Esto mostrará los 194 leads de hoy: 100 en página 1, 94 en página 2
- El paginador funcionará correctamente con `totalLeads = 194` y `totalPages = 2`
- Los KPIs reflejarán correctamente los datos de hoy
- El usuario puede cambiar el rango de fechas o limpiarlo si quiere ver otro período

### Archivo
1. `src/pages/leadgen/LeadGenContent.tsx` — líneas 64-65: cambiar `undefined` → `new Date()`

