

## Limpiar filtros duplicados en Promolog

### Problema

1. Hay una seccion de filtros colapsable (Card con Collapsible) dentro del tab Dashboard (lineas 533-600) que duplica los filtros ya presentes en la barra unificada superior (buscar, estado, red social, categoria, fechas).
2. El DateRangePicker dice "Seleccionar fechas" como placeholder, pero deberia decir "Selecciona fechas" para coincidir con Eventos.

### Cambios

| Archivo | Cambio |
|---------|--------|
| `src/pages/promolog/PromologContent.tsx` | (1) Eliminar el bloque completo del Collapsible Filters Section (lineas 533-600, la Card con los 3 selects de Creador, Red Social y Estado). (2) Cambiar el placeholder del DateRangePicker de "Seleccionar fechas" (valor por defecto del componente) a `placeholder="Selecciona fechas"`. |

### Detalle tecnico

- Se eliminan las lineas 533-600 que contienen la Card con el Collapsible de filtros duplicados
- Se agrega `placeholder="Selecciona fechas"` al DateRangePicker en la linea 413-418 (la barra de filtros unificada ya tiene los mismos filtros de estado, red social, etc.)
- Se pueden eliminar los imports de `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger` y `ChevronUp` si no se usan en otro lugar del archivo
- El estado `filtersOpen` tambien puede eliminarse ya que solo se usaba para el collapsible

