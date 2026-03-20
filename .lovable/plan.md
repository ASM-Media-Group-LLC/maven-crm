
## Plan: alinear Closers y Contactos con LeadGen sin volver a mover cosas incorrectamente

### Lo que está mal hoy
- En `/contactos` el bloque de filtros se está partiendo: “Fecha creación” y los toggles bajan a otra línea.
- En `/closers` pasa lo mismo con los toggles.
- El “header” real de las tablas (la fila `Creación / Ticket / Nombre...` y sus equivalentes) sigue sin comportarse como en LeadGen.
- La implementación actual usa `sticky` en `TableHeader`, pero en tablas HTML eso puede ser inconsistente; para que funcione como LeadGen hay que fijar las celdas `<th>` reales.

### Cambios a hacer

#### 1. `/contactos` — dejar toda la barra de filtros en una sola línea visual
**Archivo:** `src/pages/contactos/ContactosFilters.tsx`

- Mantener el mismo orden visual del screenshot:
  `Buscar → Estado → País → Categoría → Agente → Fecha creación → toggles`
- Quitar el comportamiento que empuja los toggles a otra fila.
- Compactar anchos de búsqueda/selects y hacer que todos los controles sean `shrink-0`.
- Usar una fila horizontal consistente como LeadGen, con fallback de scroll horizontal si el ancho no alcanza, en vez de romper la línea.

#### 2. `/closers` — hacer lo mismo en la barra de filtros
**Archivo:** `src/pages/closers/ClosersContent.tsx`

- Mantener todos los filtros y toggles en la misma fila:
  `Buscar → Agente → Plataforma → Fecha de paso → Seleccionar fechas → Limpiar → toggles`
- Evitar que el contenedor use wrapping que empuje los toggles abajo.
- Ajustar anchos para que a viewport desktop como el de tus screenshots entre en una sola línea, igual que LeadGen.

#### 3. `/contactos` — fijar de verdad la fila de columnas
**Archivo:** `src/pages/contactos/ContactosTable.tsx`

- Dejar de depender solo de `sticky` en `<TableHeader>`.
- Aplicar el patrón sticky sobre las `<TableHead>` reales para que la fila:
  `Creación / Ticket / Nombre / Agente / ...`
  quede fija dentro del scroll de la tabla.
- Igualar capas/fondo/sombra con LeadGen:
  - fondo sólido
  - z-index correcto
  - separación visual al hacer scroll
- Alinear también la columna de acciones sticky con el mismo layering del header.

#### 4. `/closers` — fijar de verdad la fila de columnas
**Archivo:** `src/pages/closers/components/LeadTable.tsx`

- Repetir exactamente el mismo patrón de sticky por celda de header.
- Unificar el fondo del header con LeadGen/Contactos para que no se vea “cortado” o mezclado con las filas.
- Mantener la columna de acciones sticky a la derecha sin romper el header principal.

#### 5. Homogeneizar el patrón visual de tablas
**Archivos:**
- `src/pages/contactos/ContactosTable.tsx`
- `src/pages/closers/components/LeadTable.tsx`

- Dejar ambas tablas con el mismo comportamiento base que LeadGen:
  - contenedor de tabla con scroll interno
  - fila de encabezados realmente fija
  - columna de acciones sticky
  - anchos mínimos consistentes
  - fondo y sombra coherentes

### Resultado esperado
- En `/contactos`, “Fecha creación” y los toggles quedan en la misma fila que el resto de filtros.
- En `/closers`, los toggles ya no bajan a otra línea.
- En ambos módulos, la fila de columnas de la tabla queda fija al hacer scroll, igual que en LeadGen.
- No se vuelven a mover componentes de lugar fuera del orden visual esperado.
