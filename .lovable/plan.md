
## Plan: corregir sticky del header real de las tablas sin mover filtros

### Qué entendí del problema
- Cuando dices “header”, te refieres a la fila de columnas de la tabla: “Creación”, “Ticket”, “Nombre”, etc.
- No quieres que se reorganicen los filtros ni que fecha/toggles bajen de línea innecesariamente.
- El objetivo es:
  1. mantener todos los filtros en la misma línea visual,
  2. fijar la fila de encabezados de la tabla en `/contactos`,
  3. fijar la fila de encabezados de la tabla en `/closers`.

### Hallazgos en el código
- `/contactos`
  - `ContactosFilters.tsx` ya tiene los filtros y toggles en la misma barra.
  - `ContactosTable.tsx` ya tiene `TableHeader className="sticky top-0 z-10 bg-card"` y contenedor con `max-h[...] overflow-auto`.
  - El problema probablemente no es “mover componentes”, sino ajustar el contexto de scroll/capas para que el header pegajoso funcione de verdad y no quede tapado o sin fondo consistente.
- `/closers`
  - `ClosersContent.tsx` ya deja el toggle al lado del `DateRangePicker`.
  - `LeadTable.tsx` ya tiene wrapper con `overflow-auto max-h[...]` y `TableHeader sticky`.
  - El error a corregir aquí también es del header real de la tabla, no del bloque de filtros.

### Cambios a implementar
1. **No mover la barra de filtros**
   - Mantener en `/contactos` y `/closers` el search, selects, fecha y toggles dentro de la misma fila de filtros.
   - No reubicar `DateRangePicker` ni el toggle fuera de esa línea.

2. **Fijar correctamente el header de la tabla en `/contactos`**
   - Revisar `src/pages/contactos/ContactosTable.tsx`.
   - Asegurar que:
     - el `sticky` esté aplicado al `TableHead`/`TableHeader` correcto,
     - el fondo del header sea sólido,
     - el `z-index` sea suficiente,
     - la fila sticky no quede afectada por wrappers externos.
   - Si hace falta, alinear el patrón con LeadGen:
     - header sticky sobre el contenedor scrolleable de la tabla,
     - celdas del header con fondo consistente,
     - columna de acciones sticky compatible con el header.

3. **Fijar correctamente el header de la tabla en `/closers`**
   - Revisar `src/pages/closers/components/LeadTable.tsx`.
   - Aplicar el mismo patrón visual/estructural que LeadGen:
     - fila de columnas sticky,
     - fondo sólido uniforme,
     - `z-index` correcto,
     - compatibilidad con scroll vertical y horizontal,
     - columna de acciones sticky sin romper el encabezado.

4. **Homogeneizar el patrón de tablas**
   - Dejar `/contactos` y `/closers` siguiendo la misma lógica visual que LeadGen:
     - contenedor interno de scroll para la tabla,
     - header sticky real de columnas,
     - acciones sticky a la derecha,
     - fondo y capas consistentes.

### Archivos a tocar
- `src/pages/contactos/ContactosTable.tsx`
- `src/pages/closers/components/LeadTable.tsx`

### Resultado esperado
- En `/contactos`, la fila “Creación / Ticket / Nombre / ...” queda fija al hacer scroll dentro de la tabla.
- En `/closers`, la fila de columnas también queda fija correctamente.
- Los filtros no se mueven de sitio: fecha y toggles permanecen en la misma línea que el resto de filtros.
