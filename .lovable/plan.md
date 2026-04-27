## Eliminar participante de una sala (Coordinador)

Agregar al Coordinador la capacidad de expulsar a un participante de una sala desde la vista "Seleccione sala para ingresar" (las cards de salas en `CoworkHostDashboard`).

### UX

En cada tarjeta de participante dentro de una sala (las mini‑cards con avatar/iniciales y nombre), al hacer hover se mostrará un botón pequeño con icono `UserX` en la esquina superior derecha. Al pulsarlo se abre un `AlertDialog` de confirmación:

- Título: "Eliminar participante"
- Descripción: "¿Seguro que quieres eliminar a {nombre} de la sala {room.name}?"
- Acciones: Cancelar / Eliminar (variante destructiva)

Tras confirmar:
- Se desactiva la asignación en la base de datos (queda "sin asignar" en la sesión, no se le saca de la sesión completa).
- Se cierra el dialog y aparece toast: "{nombre} eliminado de la sala".
- Realtime ya refresca el listado automáticamente vía la suscripción a `cowork_room_assignments`.

Solo se muestra para participantes (no para el propio coordinador).

### Cambios técnicos

1. **`supabase/functions/cowork-session/index.ts`** — Nueva acción `removeFromRoom`:
   - Input: `{ sessionId, targetUserId, roomId }`.
   - Verifica que el caller sea `host` de la sesión (mismo patrón que `assignToRoom` / `moveParticipant`).
   - `update cowork_room_assignments set is_active = false where session_id = ? and user_id = ? and room_id = ? and is_active = true`.

2. **`src/hooks/useCoworkSession.ts`** — Exponer `removeFromRoom(targetUserId, roomId)` que invoca la edge function y devolverlo en el return del hook.

3. **`src/pages/cowork/CoworkHostDashboard.tsx`**:
   - Importar `UserX` de lucide-react y `AlertDialog*` de `@/components/ui/alert-dialog`.
   - Estado local `removingParticipant: { userId: string; name: string; roomId: string; roomName: string } | null`.
   - En la mini‑card del participante (líneas ~406‑426) añadir un botón flotante absoluto (top‑right) con `UserX`, visible en hover (`opacity-0 group-hover:opacity-100`), que abre el dialog. El contenedor de la card recibirá `relative group`.
   - Render del `AlertDialog` al final del componente, con handler que llama `cowork.removeFromRoom(...)`, muestra toast y limpia el estado.

### Notas

- LiveKit no requiere acción extra: el participante se queda en la sesión sin asignación; el `CoworkParticipantView` ya reacciona a `myAssignment` y lo sacará automáticamente de la sala LiveKit cuando la suscripción realtime detecte `is_active=false`.
- No se elimina la membresía de la sesión, solo la asignación a la sala (consistente con el resto del módulo, donde "sin asignar" es un estado válido visible en el sidebar).
