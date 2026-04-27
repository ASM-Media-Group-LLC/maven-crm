## Problema

Cuando un participante cierra la pestaña, su avatar sigue apareciendo en la tarjeta de la sala del dashboard del coordinador (con contador "1 👤"), aunque LiveKit ya lo sacó del WebRTC y `useOnlinePresence` lo marca offline (punto gris).

## Causa raíz

El participante se auto-une a una sala vía URL (`?room=X`) llamando a `joinSession` en la edge function, lo que crea una fila en `cowork_room_assignments` con `is_active = true`. **Esa fila nunca se desactiva** al cerrar pestaña porque:

1. La edge function `cowork-session` no tiene ninguna acción `leaveRoom` / `leaveSession`.
2. `CoworkParticipantView.tsx` no tiene listener de `beforeunload` ni `pagehide`.
3. Cuando el participante hace clic en "Salir" desde el `LiveKitCallView` (`onLeave`), solo se limpia estado local — tampoco se desactiva la asignación en BD.

Además, **dado que ya no existe la asignación manual del coordinador**, mantener la fila persistente no aporta valor: el participante siempre vuelve por su propio link, la asignación se debe recrear/reactivar al re-entrar.

## Solución

Tratar `cowork_room_assignments` como **presencia en vivo**, no como membresía persistente. La fila debe desactivarse cuando el participante sale (de cualquier forma).

### Cambios

**1. Edge function `supabase/functions/cowork-session/index.ts`**
- Añadir nueva acción `leaveRoom` (`{ sessionId }`): desactiva (`is_active = false`) cualquier asignación activa del usuario autenticado en esa sesión. Idempotente y rápido.

**2. Hook `src/hooks/useCoworkSession.ts`**
- Exponer `leaveRoom = useCallback(async () => invokeCowork("leaveRoom", { sessionId }), [sessionId])` en el objeto retornado.

**3. Vista `src/pages/cowork/CoworkParticipantView.tsx`**
- Llamar a `cowork.leaveRoom()` en tres puntos:
  - Dentro del `onLeave` del `LiveKitCallView` principal (cuando el usuario hace clic en colgar).
  - En un listener `pagehide` (más fiable que `beforeunload` en móviles e iOS Safari) usando `navigator.sendBeacon` o `fetch` con `keepalive: true` apuntando directo al endpoint, para que el request se complete aunque la pestaña ya esté cerrándose.
  - Limpieza del `useEffect` principal al desmontar el componente.

**4. Backend de respaldo (failsafe ante crashes / pérdida de red)**
- LiveKit emite webhook `participant_left` cuando detecta desconexión real. **No** lo agregamos ahora para mantener el cambio acotado, pero queda documentado: si en el futuro queremos cobertura ante crashes totales (sin `pagehide` que dispare), se puede crear un webhook handler que marque `is_active = false`. Mientras tanto, el coordinador puede recargar y verá el estado correcto la próxima vez que el participante intente reconectar (la lógica ya recrea la asignación en `joinSession` líneas 158-169).

### Resultado esperado

- Participante cierra pestaña → `pagehide` dispara `leaveRoom` con `keepalive` → BD se actualiza → realtime de Supabase notifica al coordinador → tarjeta de la sala muestra "0 👤" en menos de ~2 s.
- Participante hace clic en colgar dentro de la sala → mismo efecto.
- Participante recarga la página y vuelve a entrar → `joinSession` recrea la asignación automáticamente (ya implementado).

### Archivos a modificar

- `supabase/functions/cowork-session/index.ts` (+ ~20 líneas para nueva acción)
- `src/hooks/useCoworkSession.ts` (+ ~3 líneas)
- `src/pages/cowork/CoworkParticipantView.tsx` (+ ~15 líneas: listener `pagehide` + cleanup + onLeave)

### Notas técnicas

- `pagehide` se dispara también cuando el navegador entra al bfcache; para evitar falsas salidas, se filtrará por `event.persisted === false` para llamar `leaveRoom` solo cuando la página realmente se descarga.
- Para asegurar que el request llegue al servidor incluso si la pestaña se está cerrando, se usará `fetch(..., { keepalive: true })` (compatible con todos los navegadores modernos, incluido iOS Safari 16.4+).
