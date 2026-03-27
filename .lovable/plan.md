

## Plan: Mejorar layout de Creadores — KPI cards + scroll de tabla

### Cambios

**1. Integrar "Total Creadoras" como primera card en la fila de KPIs**
En `CreadoresKPICards.tsx`: eliminar la `Card` separada de "Total de Creadoras" (líneas 39-47) y añadirla como primer elemento del array `cards` con icono `Users`, estilo neutral similar al de Closers.

**2. Cambiar layout de contenido a flex con scroll interno (como Contactos)**
En `CreadoresContent.tsx`: reemplazar el `div.overflow-auto` general por un layout flex donde:
- KPI cards, tabs de agencia, filtros → `shrink-0`
- `DataTableShell` → `className="flex-1 min-h-0"` (scroll interno, no scroll de página)

Esto replica el patrón de Contactos donde la tabla ocupa el espacio restante con scroll propio y el paginador siempre es visible.

### Archivos
- **Modificar**: `src/pages/creadores/CreadoresKPICards.tsx`
- **Modificar**: `src/pages/creadores/CreadoresContent.tsx`

