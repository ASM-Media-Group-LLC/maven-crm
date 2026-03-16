

## Plan: Headers fijos en Closers

### Problema
1. El header de página ("Closers") ya es `shrink-0` pero todo el contenido debajo (KPIs, tabs, filtros, tabla) está dentro de un solo `div.overflow-auto`, así que al hacer scroll se pierden los tabs y filtros.
2. El `<thead>` de la tabla no es sticky — al scrollear filas se pierde la referencia de las columnas.

### Cambios

**`src/pages/closers/ClosersContent.tsx`**
- Mover las KPIs, TabsList y filtros fuera del div scrollable, haciéndolos `shrink-0` para que queden fijos.
- Solo el contenido de la tabla (TabsContent) queda dentro del área scrollable.

**`src/pages/closers/components/LeadTable.tsx`**
- Agregar `sticky top-0 z-10 bg-background` al `<TableHeader>` para que los encabezados de columna permanezcan visibles al hacer scroll dentro de la tabla.

**`src/components/ui/table.tsx`**
- No se modifica — el sticky se aplica directamente en LeadTable.

