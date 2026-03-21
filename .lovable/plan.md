

## Plan: Auditoría y corrección de tablas — LeadGen, Closers, Contactos, Promolog

### Problema raíz encontrado

**LeadGen no carga (nada visible):** El contenido de la tabla (líneas 323-486) está anidado DENTRO del div "Scrollable top controls" (línea 235) que tiene `maxHeight: "45vh"`. Los KPIs, tabs y filtros ya consumen ese espacio, dejando 0px para la tabla. Falta un `</div>` de cierre antes de la sección de contenido de tabs.

**Closers no scrollea:** El contenedor de la tabla en `ClosersContent.tsx` (línea 197) usa `flex-1` sin `min-h-0` ni `overflow-auto`. La tabla (`LeadTable.tsx`) no tiene contenedor con scroll propio — depende del padre que no scrollea.

**Contactos paginador encima:** El layout en `ContactosContent.tsx` tiene la tabla en `flex-1 min-h-0` pero sin `overflow-auto` en el wrapper de la tabla, así que no hay scroll interno y el paginador flota sin contexto correcto.

**Promolog "ver todo" mal:** `PromologContent.tsx` usa `flex-1 overflow-auto p-6 space-y-6` (línea 439) como un solo contenedor scrollable para TODO (KPIs + cards + tabs + tabla). No hay separación entre controles fijos y tabla scrollable; no tiene paginación.

### Correcciones

#### 1. LeadGenContent.tsx — cerrar el div correctamente
- Cerrar el div "Scrollable top controls" (`maxHeight: 45vh`) DESPUÉS de los filtros (línea 320), ANTES del tab content (línea 323).
- Esto libera el tab content para que ocupe `flex-1 min-h-0` correctamente.
- Dentro del tab "leads", el wrapper de la tabla debe tener `flex-1 min-h-0 overflow-auto` para scroll vertical con sticky headers.
- El paginador (`shrink-0 pt-3`) ya está fuera del scroll — solo necesita que el div padre funcione.

#### 2. ClosersContent.tsx — agregar scroll al contenedor de tabla
- En línea 197, cambiar `<div className="flex-1 px-6 py-4">` a `<div className="flex-1 min-h-0 overflow-auto px-6 py-4">`.
- Envolver la tabla `CloserTable` en un div con `overflow-auto` para que tenga scroll vertical+horizontal propio.
- El paginador (líneas 221-236) ya está fuera de la tabla — moverlo fuera del div scrollable para que sea `shrink-0`.

#### 3. ContactosContent.tsx — scroll interno para la tabla
- En línea 292, el div `flex-1 min-h-0` necesita `overflow-auto` para que la tabla scrollee dentro de ese espacio.
- El paginador en líneas 302-307 ya está en un `shrink-0` — solo falta que el contenedor de tabla tenga overflow correcto.

#### 4. PromologContent.tsx — separar controles de tabla
- El gran `div className="flex-1 overflow-auto p-6 space-y-6"` (línea 439) es un solo bloque scrollable. La tabla de promos queda al final y no tiene paginación.
- Reestructurar: mantener KPIs + social cards + tab bar en un área `shrink-0` con `overflow-auto max-h` limitada (como LeadGen).
- Dejar la tabla de promos en `flex-1 min-h-0 overflow-auto` con sus sticky headers.
- Agregar paginador visible debajo (aunque Promolog hoy trae `.limit(200)`, al menos mostrarlo para los resultados existentes).

### Archivos a modificar
- `src/pages/leadgen/LeadGenContent.tsx` — mover `</div>` de cierre del scrollable top controls
- `src/pages/closers/ClosersContent.tsx` — agregar overflow-auto y reestructurar paginador
- `src/pages/contactos/ContactosContent.tsx` — agregar overflow-auto al wrapper de tabla
- `src/pages/promolog/PromologContent.tsx` — separar KPIs/filtros de la tabla scrollable

### Resultado esperado
- LeadGen vuelve a mostrar la tabla y el paginador sin estar recortado.
- Closers scrollea verticalmente y muestra el paginador.
- Contactos tiene scroll interno en la tabla y el paginador no se monta encima.
- Promolog separa visualmente los controles fijos de la tabla y deja de verse "terriblemente mal" al hacer scroll.
- Los sticky headers de columnas funcionan en todas las tablas porque cada una tiene su propio contenedor de scroll.

