

## Plan: Corregir auto-hide de stats cards y espaciado de columna Acciones

### Problema 1: Stats cards no se ocultan al hacer scroll
En ambos módulos (LeadGen y Closers), las KPI cards están **fuera** del contenedor scrollable. El `onScroll` handler está en el div de contenido de la tabla, pero las cards están en un `shrink-0` div hermano superior. Como el scroll solo ocurre dentro del contenedor de la tabla, las cards nunca reciben la señal de colapso.

### Problema 2: Columna Acciones con exceso de espacio
La columna Acciones en la tabla de agentes (LeadGenContent) y en LeadGenTable usa `sticky right-0` sin ancho fijo, lo que genera un ancho excesivo en pantallas anchas.

### Solución

#### 1. Reestructurar layout para auto-hide (`LeadGenContent.tsx`)
- Mover las KPI cards **dentro** del contenedor scrollable (el div con `onScroll`)
- Las cards serán el primer hijo del div scrollable, seguidas por el contenido del tab activo
- Así, al scrollear la tabla hacia abajo, `scrollTop > 40` se activará y colapsará las cards

#### 2. Mismo ajuste en Closers (`ClosersContent.tsx`)
- Mover `ClosersKPICards` dentro del div scrollable (`flex-1 min-h-0 overflow-auto onScroll`)
- Mismo patrón: cards como primer hijo del contenedor scrollable

#### 3. Limitar ancho de columna Acciones
- En `LeadGenContent.tsx` (tabla agentes) y `LeadGenTable.tsx`: agregar `w-[80px]` al `TableHead` y `TableCell` de Acciones para evitar que se expanda innecesariamente

### Archivos a modificar
- `src/pages/leadgen/LeadGenContent.tsx` — mover KPI cards dentro del scroll container, fijar ancho Acciones
- `src/pages/closers/ClosersContent.tsx` — mover KPI cards dentro del scroll container
- `src/pages/leadgen/LeadGenTable.tsx` — fijar ancho columna Acciones

