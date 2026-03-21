

## Plan: Eliminar tabla "fija" en todos los módulos

### Problema
`DataTableShell` tiene `flex flex-col flex-1 min-h-0` en su div raíz (línea 46). Esto funciona cuando el parent es un flex container con altura acotada (Contactos, LeadGen, Closers), pero **rompe** en módulos donde la tabla está dentro de un `overflow-auto` general de página (Creadores, Promolog, HR Applicants). En esos casos, `flex-1` no recibe altura del parent, así que la tabla toma altura natural 0 o queda desconectada del scroll de la página.

### Solución
Hacer que `DataTableShell` sea neutro — sin `flex-1 min-h-0` forzado. Los módulos que necesitan que la tabla llene el espacio restante le pasan una clase extra.

### Cambios

#### 1. `src/components/ui/data-table-shell.tsx` (línea 46)
- Cambiar `<div className="flex flex-col flex-1 min-h-0">` a `<div className={cn("flex flex-col", className)}>` 
- Mover las clases `flex-1 min-h-0` al scroll area interno solo si el parent lo necesita
- Mejor aún: el div raíz sea simplemente `flex flex-col` y el scroll area interna sea solo `overflow-auto rounded-lg border` (sin `flex-1 min-h-0`)
- Los módulos que necesitan stretch (LeadGen, Closers, Contactos) pasan `className="flex-1 min-h-0"` al shell

#### 2. Módulos con layout flex acotado — agregar `className="flex-1 min-h-0"`
- `src/pages/leadgen/LeadGenContent.tsx` línea 348: `<DataTableShell className="flex-1 min-h-0" ...>`
- `src/pages/closers/ClosersContent.tsx` línea 199: `<DataTableShell className="flex-1 min-h-0" ...>`
- `src/pages/contactos/ContactosContent.tsx` línea 297: `<DataTableShell className="flex-1 min-h-0" ...>`

#### 3. Módulos con scroll de página — sin clase extra (ya fluyen naturalmente)
- `src/pages/creadores/CreadoresContent.tsx` — sin cambios (ya está en `overflow-auto p-6`)
- `src/pages/promolog/PromologContent.tsx` — sin cambios
- `src/pages/hr/HRApplicants.tsx` — sin cambios

### Resultado
- En Creadores, Promolog, HR: la tabla fluye dentro del scroll general de la página junto con KPIs y filtros. No queda "fija".
- En LeadGen, Closers, Contactos: la tabla sigue llenando el espacio restante con scroll interno gracias a `flex-1 min-h-0`.
- Un solo componente, comportamiento controlado por el parent.

