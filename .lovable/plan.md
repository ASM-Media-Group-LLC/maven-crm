
Objetivo: corregir de forma consistente las tablas grandes de `/leadgen`, `/closers`, `/contactos`, `/promolog` y `/creadores` para que cumplan 4 reglas al mismo tiempo: paginación real, paginador siempre visible, header de columnas sticky real y scrollbar horizontal visible en desktop.

### Lo que encontré en el código
- `LeadGen` y `Closers` ya usan paginación server-side.
- `Contactos` ya tiene paginación, pero su layout deja el paginador separado de una forma que termina montándose sobre la tabla.
- `Promolog` no tiene paginación real: hoy trae `.limit(200)` y luego filtra en cliente.
- `Creadores` tampoco tiene paginación real: hoy `useCreadores` descarga todo y filtra en cliente.
- Varias tablas siguen usando sticky en `TableHeader` completo o mezclan wrappers con `overflow-hidden/overflow-auto`, lo que rompe el header sticky o esconde la barra horizontal.
- En `LeadGen`, el problema del paginador cortado viene del layout de página: la tabla consume demasiado alto y el footer queda fuera del área visible.

### Enfoque que voy a aplicar
Voy a unificar el patrón de las tablas grandes:

```text
módulo
 ├─ header / KPIs / filtros  (shrink-0)
 └─ sección de resultados    (flex-1 min-h-0 flex flex-col)
    ├─ tabla                 (flex-1 min-h-0)
    │  └─ scroll interno     (overflow-auto)
    │     └─ table min-width + header sticky por celda
    └─ footer paginador      (shrink-0, siempre visible)
```

Eso permite:
- scroll vertical dentro de la tabla,
- header sticky relativo al scroll correcto,
- scrollbar horizontal visible,
- paginador fuera del área que scrollea, así nunca queda cortado.

### Cambios por área

#### 1. Patrón base de tablas grandes
**Archivos:**
- `src/pages/contactos/ContactosTable.tsx`
- `src/pages/closers/components/LeadTable.tsx`
- `src/pages/leadgen/LeadGenTable.tsx`
- `src/pages/promolog/PromologTable.tsx`
- `src/pages/creadores/CreadoresTable.tsx`

Voy a dejar todas con el mismo patrón visual:
- `overflow-auto` en el contenedor que realmente scrollea.
- `min-w-[...]` suficiente para forzar scroll horizontal visible en desktop.
- sticky aplicado a cada `TableHead`, no solo al `TableHeader`.
- fondo sólido + `z-index` correcto en header y columna de acciones.
- sin wrappers que oculten la barra horizontal.

#### 2. LeadGen
**Archivos:**
- `src/pages/leadgen/LeadGenContent.tsx`
- `src/pages/leadgen/LeadGenTable.tsx`

Correcciones:
- mover el bloque tabla + paginación a una sección `flex-1 min-h-0 flex flex-col`.
- dejar el paginador debajo de la tabla, fuera del scroll vertical.
- ajustar la altura útil de la tabla para que el paginador no vuelva a quedar cortado.
- mantener el header de columnas sticky y la columna de acciones sticky.

#### 3. Contactos
**Archivos:**
- `src/pages/contactos/ContactosContent.tsx`
- `src/pages/contactos/ContactosTable.tsx`

Correcciones:
- evitar que el paginador quede encima de la tabla.
- dejar la tabla dentro de una sección de resultados con altura controlada.
- mantener paginación server-side existente.
- revisar el filtro `creadoPor`, porque hoy se aplica en cliente sobre una sola página y puede volver inconsistente el conteo visible.

#### 4. Closers
**Archivos:**
- `src/pages/closers/ClosersContent.tsx`
- `src/pages/closers/components/LeadTable.tsx`

Correcciones:
- conservar la paginación server-side actual.
- mover el paginador a un footer estable siempre visible debajo de la tabla.
- asegurar scroll horizontal visible y header sticky real.
- no volver a tocar el layout de tabs/filtros fuera de lo necesario.

#### 5. Promolog
**Archivos:**
- `src/pages/promolog/PromologContent.tsx`
- `src/pages/promolog/PromologTable.tsx`

Correcciones:
- reemplazar `.limit(200)` por paginación server-side con `count: "exact"` + `.range()`.
- agregar estado `page` y paginador visible.
- dejar el footer del paginador fuera del scroll de filas.
- aplicar sticky por `TableHead` para el header real.

#### 6. Creadores
**Archivos:**
- `src/pages/creadores/useCreadores.ts`
- `src/pages/creadores/CreadoresContent.tsx`
- `src/pages/creadores/CreadoresTable.tsx`

Correcciones:
- pasar de carga total en cliente a paginación server-side.
- devolver `{ data, total, totalPages }` desde el hook.
- agregar paginador visible debajo de la tabla.
- mantener filtros, pero paginando sin descargar toda la tabla completa.
- convertir también su header a sticky por celda.

### Resultado esperado
- `LeadGen`, `Closers`, `Contactos`, `Promolog` y `Creadores` tendrán paginación visible y usable.
- Ningún paginador quedará cortado por el borde inferior ni montado encima de la tabla.
- El header real de columnas permanecerá fijo al hacer scroll vertical.
- El scroll lateral tendrá barra visible en desktop.
- Las tablas grandes dejarán de depender de layouts frágiles y quedarán con un patrón accesible y consistente.

### Archivos a tocar
- `src/pages/leadgen/LeadGenContent.tsx`
- `src/pages/leadgen/LeadGenTable.tsx`
- `src/pages/contactos/ContactosContent.tsx`
- `src/pages/contactos/ContactosTable.tsx`
- `src/pages/closers/ClosersContent.tsx`
- `src/pages/closers/components/LeadTable.tsx`
- `src/pages/promolog/PromologContent.tsx`
- `src/pages/promolog/PromologTable.tsx`
- `src/pages/creadores/useCreadores.ts`
- `src/pages/creadores/CreadoresContent.tsx`
- `src/pages/creadores/CreadoresTable.tsx`
