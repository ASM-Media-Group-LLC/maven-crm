

## Plan: Compactar stats cards de LeadGen para dar más espacio a la tabla

### Problema
Las dos KPI cards (Cantidad y Estados) ocupan demasiado espacio vertical (~200px+), dejando poco espacio para la tabla. En un viewport de 887px, después del header, KPIs, tabs y filtros, quedan apenas ~250px para la tabla — insuficiente para mostrar 5 filas.

### Solución
Compactar ambas cards para que ocupen ~50% del espacio actual, pasando de layout vertical a horizontal dentro de cada card.

### Cambios

#### 1. `LeadGenCantidadCard.tsx`
- Reducir padding del CardHeader y CardContent (`pb-1`, `p-4 pt-0`)
- Cambiar los botones de categoría: reducir padding de `p-2` a `p-1.5`, font del número de `text-xl` a `text-base`
- Reducir la fila Total/QA: padding de `px-3 py-2` a `px-2 py-1`, font de `text-lg` a `text-sm`
- Reducir `mb-3` a `mb-1.5` entre las dos secciones

#### 2. `LeadGenEstadosCard.tsx`
- Reducir padding de cada botón de estado de `py-2.5` a `py-1.5`
- Reducir `space-y-1` a `space-y-0.5`
- Reducir padding del CardHeader y CardContent (`pb-1`, `p-4 pt-0`)

#### 3. `LeadGenContent.tsx` (línea 235)
- Reducir padding del contenedor de KPIs de `py-4` a `py-2`

### Resultado
Las cards pasan de ~200px a ~130px de alto, liberando ~70px adicionales para la tabla — suficiente para mostrar al menos 5 filas de leads con la paginación visible.

### Archivos a modificar
- `src/pages/leadgen/LeadGenCantidadCard.tsx`
- `src/pages/leadgen/LeadGenEstadosCard.tsx`
- `src/pages/leadgen/LeadGenContent.tsx`

