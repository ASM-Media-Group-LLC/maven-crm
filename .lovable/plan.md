
Objetivo: corregir de raíz el patrón de tablas para que en Contactos, Closers y LeadGen se cumplan 3 cosas a la vez: header de columnas sticky real, scrollbar horizontal visible en desktop y paginación siempre visible sin quedar cortada.

### Hallazgo principal
El problema no está solo en cada página: está en el componente compartido `src/components/ui/table.tsx`.

Hoy `Table` siempre renderiza su propio wrapper:
```tsx
<div className="relative w-full overflow-x-auto">
  <table ... />
</div>
```
pero el `className` se aplica al `<table>`, no a ese wrapper. Por eso intentos como `[&>div]:!overflow-visible` no funcionan realmente y dejan el comportamiento inconsistente:
- el sticky depende de un scroll container distinto al esperado,
- el scrollbar lateral no se controla correctamente por módulo,
- aparecen dobles contextos de scroll,
- el paginador termina fuera de la zona visible.

### Qué voy a cambiar

#### 1. Arreglar el componente base `Table`
**Archivo:** `src/components/ui/table.tsx`

Voy a separar responsabilidades para que el wrapper horizontal sí sea configurable desde cada tabla. La corrección más limpia es una de estas dos:
- agregar props para el wrapper (`containerClassName` / `containerProps`), o
- simplificar `Table` para que no meta un wrapper fijo y dejar que cada página controle su propio contenedor.

La meta es que cada módulo pueda definir explícitamente:
- scroll horizontal visible,
- scroll vertical del área de datos,
- contexto correcto para sticky.

#### 2. Unificar patrón accesible de tablas con mucha data
Aplicar el mismo patrón en:
- `src/pages/contactos/ContactosTable.tsx`
- `src/pages/closers/components/LeadTable.tsx`
- `src/pages/leadgen/LeadGenTable.tsx`

Patrón objetivo:
```text
outer column layout
 ├─ filters / KPIs (no sticky de tabla aquí)
 ├─ table shell
 │   ├─ horizontal scrollbar visible
 │   └─ vertical scroll area for rows
 │       └─ table
 │           ├─ sticky header row (titles de columnas)
 │           └─ sticky actions column when exista
 └─ pagination footer visible debajo de la tabla
```

Eso implica:
- contenedor de tabla con `overflow-x-auto` real y visible,
- área vertical con `max-h`/`overflow-y-auto` para que el header sticky se adhiera ahí,
- `TableHead` sticky por celda, no confiar solo en `thead`,
- `z-index` y fondo sólidos en header y columna de acciones.

#### 3. Corregir Contactos
**Archivos:**
- `src/pages/contactos/ContactosContent.tsx`
- `src/pages/contactos/ContactosTable.tsx`
- `src/pages/contactos/ContactosFilters.tsx`

Cambios:
- mantener filtros en una sola línea horizontal con scroll x si hace falta, sin romper el orden visual,
- dejar la tabla dentro de un shell propio con scroll horizontal visible,
- fijar la fila de columnas real (`Creación`, `Ticket`, `Nombre`, etc.),
- dejar el paginador fuera del área que scrollea verticalmente para que siempre sea visible,
- revisar el `max-h` para que no compita con header/KPIs/filtros.

#### 4. Corregir Closers
**Archivos:**
- `src/pages/closers/ClosersContent.tsx`
- `src/pages/closers/components/LeadTable.tsx`

Cambios:
- no volver a romper el layout de tabs,
- mantener filtros y toggles en la misma línea,
- encapsular la tabla en su propio shell scrolleable,
- hacer sticky la fila de columnas por `<TableHead>`,
- conservar columna de acciones sticky a la derecha,
- dejar paginación completamente visible debajo de la tabla, fuera del scroll vertical de filas.

Además, en Closers hay una causa extra:
- `useCloserLeads` ya pagina server-side, pero `ClosersContent` muestra `creators.length` del resultado filtrado en cliente. Voy a mantener la paginación visible y coherente con el dataset paginado actual para que no genere confusión.

#### 5. Corregir LeadGen
**Archivos:**
- `src/pages/leadgen/LeadGenContent.tsx`
- `src/pages/leadgen/LeadGenTable.tsx`

Cambios:
- evitar que el `max-h` de la tabla se coma el espacio del paginador,
- dejar el paginador siempre debajo y visible,
- asegurar scrollbar lateral visible en desktop,
- mantener sticky el header de columnas como referencia visual del dataset.

### Resultado esperado
- El usuario siempre verá el paginador completo en tablas grandes.
- El header de columnas permanecerá fijo al hacer scroll vertical dentro de la tabla.
- El scroll lateral tendrá scrollbar visible y usable en desktop.
- Contactos, Closers y LeadGen compartirán el mismo patrón accesible y consistente.
- Se elimina la fragilidad actual causada por el wrapper interno del componente `Table`.

### Archivos a tocar
- `src/components/ui/table.tsx`
- `src/pages/contactos/ContactosContent.tsx`
- `src/pages/contactos/ContactosTable.tsx`
- `src/pages/contactos/ContactosFilters.tsx`
- `src/pages/closers/ClosersContent.tsx`
- `src/pages/closers/components/LeadTable.tsx`
- `src/pages/leadgen/LeadGenContent.tsx`
- `src/pages/leadgen/LeadGenTable.tsx`
