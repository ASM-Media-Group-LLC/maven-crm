

## Plan: Eliminar el scroll separado en Promolog

### Problema
Línea 442 tiene `shrink-0 overflow-auto` con `maxHeight: "45vh"` — esto crea un área scrollable independiente para KPIs/social/tabs. El usuario ve dos scrolls: uno para los controles superiores y otro para la tabla. No es natural.

### Solución
Cambiar a un layout de página única scrollable:
- Eliminar el `maxHeight: "45vh"` y `overflow-auto` del contenedor de KPIs/social/tabs (línea 442)
- Eliminar el `overflow-hidden` del contenedor de la tabla (línea 571)
- Envolver TODO el contenido (KPIs + social + tabs + filtros + tabla) en un solo `flex-1 overflow-auto p-6 space-y-6`
- El `DataTableShell` seguirá manejando la paginación, pero no necesita ser `flex-1` — simplemente fluye dentro del scroll general de la página

Resultado: toda la página scrollea como una unidad natural (como se ve en la screenshot del usuario donde funciona bien visualmente), y la tabla tiene su paginador visible al final.

### Archivo a modificar
- `src/pages/promolog/PromologContent.tsx` — líneas 442 y 571

