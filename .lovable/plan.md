## Eliminar lógica de asignación manual de salas

La función "Sin asignar" del sidebar del coordinador y las acciones backend asociadas ya no se usan: los participantes se auto-unen vía URL (`?room=X`) y, con el cambio anterior de `pagehide`/`leaveRoom`, la asignación se gestiona como presencia en vivo. Eliminar este código muerto evita confusión y reduce superficie.

### Cambios

**1. `supabase/functions/cowork-session/index.ts`**
- Eliminar bloque `if (action === "assignToRoom") { ... }` (líneas 218-240).
- Eliminar bloque `if (action === "moveParticipant") { ... }` (líneas 315-337).
- Conservar todo lo demás (incluida la auto-asignación dentro de `joinSession` cuando llega `?room=X`, que es la única forma de entrar a una sala hoy).

**2. `src/hooks/useCoworkSession.ts`**
- Eliminar las funciones `assignToRoom` y `moveParticipant` (líneas 181-187).
- Quitarlas del `return { ... }` (línea 233).

**3. `src/pages/cowork/CoworkHostDashboard.tsx`**
- Eliminar todo el bloque IIFE "Unassigned members" que renderiza la sección "Sin asignar" con el `<Select>` "Asignar..." (líneas 230-265, dentro del `<ScrollArea>`).
- Esto elimina el único consumidor en la UI de `cowork.assignToRoom`.

### Resultado

- El sidebar del coordinador ya no muestra la sección "SIN ASIGNAR".
- Si un usuario entra al lobby sin `?room=X` (caso raro), simplemente queda como `membership` sin asignación, esperando que use un link directo a sala. Si esto se vuelve un problema visible más adelante, se puede mostrar un mensaje informativo, pero no se incluye ahora para mantener el cambio acotado.
- El backend rechaza con "Unknown action" cualquier llamada vieja a `assignToRoom`/`moveParticipant` (no hay clientes que las llamen, ya verificado con `rg`).

### Archivos a modificar

- `supabase/functions/cowork-session/index.ts` (eliminar ~46 líneas)
- `src/hooks/useCoworkSession.ts` (eliminar ~8 líneas)
- `src/pages/cowork/CoworkHostDashboard.tsx` (eliminar ~36 líneas)
