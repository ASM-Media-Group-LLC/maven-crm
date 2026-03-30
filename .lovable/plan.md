

## Plan: Estandarizar tablas y ocultar stats cards al hacer scroll en /leadgen

### Problema
1. La tabla de agentes en el tab "Agentes" tiene un estilo diferente al estándar `LeadGenTable` (sin `DataTableShell`, sin `SortHeader`)
2. En `AgentDetailView`, las KPI cards usan `border-t-[3px]` con gradientes y las quality cards usan gradientes oscuros (`from-emerald-600 to-emerald-900`), completamente fuera del sistema de diseño estándar
3. Las stats cards ocupan espacio fijo y no se ocultan al hacer scroll, reduciendo el espacio disponible para la tabla

### Cambios

#### 1. Ocultar stats cards al hacer scroll (`LeadGenContent.tsx`)
- Detectar scroll en el contenedor principal del tab content
- Cuando el usuario scrollea hacia abajo, colapsar las stats cards con una transición suave (`max-height` + `opacity` + `overflow-hidden`)
- Cuando vuelve arriba (scroll top < umbral), mostrarlas de nuevo
- Usar un `useState` + `onScroll` handler en el contenedor de tabs

#### 2. Estandarizar tabla de agentes (`LeadGenContent.tsx`, tab "Agentes")
- Envolver la tabla en `DataTableShell` para consistencia
- Agregar `SortHeader` a las columnas (Agente, Total, A+, A, B+, B, C)
- Usar el mismo patrón de sticky headers y columna de Acciones del estándar

#### 3. Estandarizar cards en `AgentDetailView.tsx`
- **KPI Cards** (Última Hora, Total Hoy, Promedio por Hora): Reemplazar el estilo `border-t-[3px]` por el patrón estándar KPI — label arriba izquierda, icono con badge de color arriba derecha, valor grande abajo izquierda, con hover scale
- **Quality Cards** (A+, A, B+, B, C): Reemplazar los gradientes oscuros por el mismo estilo usado en `LeadGenCantidadCard` — cards con `Card`/`CardContent`, icono con badge de color, hover con gradiente sutil, colores semánticos (primary, success, warning, muted-foreground)

### Archivos a modificar
- `src/pages/leadgen/LeadGenContent.tsx` — auto-hide stats cards en scroll, DataTableShell + SortHeader en tabla agentes
- `src/pages/leadgen/AgentDetailView.tsx` — estandarizar KPI cards y quality cards al design system

