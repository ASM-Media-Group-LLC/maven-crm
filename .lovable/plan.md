# Plan: Revocar acceso a compartir pantalla automáticamente

## Problema
Cuando el coordinador aprueba una solicitud de "Compartir pantalla", el participante recibe un nuevo token de LiveKit con permisos para publicar pantalla. Actualmente este acceso queda activo de forma indefinida: el flag local `hasScreenShareAccess` solo se resetea al cambiar de sala o salir manualmente, por lo que el participante puede iniciar y detener la pantalla múltiples veces sin volver a pedir permiso.

## Solución
Hacer que el permiso sea de **un solo uso por sesión activa**: cuando el participante deja de compartir pantalla (o se desconecta), el acceso se revoca automáticamente y debe volver a solicitarlo.

## Cambios

### 1. `CoworkParticipantView.tsx` — revocar al detener el share
Detectar la transición `screenShareOn: true → false` dentro de `handleMediaStateChange`. Cuando ocurra y el participante tenga `hasScreenShareAccess = true`:
- Limpiar `hasScreenShareAccess` y `screenShareTokenRef.current`.
- Forzar reconexión a la sala usando el token estándar (sin permiso de pantalla) — mismo patrón ya usado al aprobar: `setConnectedLkRoom(null)` y luego restaurar la sala con un pequeño timeout.
- Mostrar toast informativo: "Permiso de pantalla finalizado. Solicítalo de nuevo si lo necesitas."

También revocar el flag cuando el participante presiona "Salir" (ya se hace) y cuando es removido de la sala.

### 2. `useCoworkMediaPresence` — sin cambios
El hook ya emite el estado `screenShareOn` en cada cambio. Solo lo consumiremos para detectar la transición.

### 3. (Opcional, defensa en backend) `cowork-session/index.ts`
El token emitido en `claimScreenShareToken` ya tiene TTL de 10 min, lo cual limita el abuso. No se requieren cambios adicionales en el edge function ya que la revocación es client-side mediante reconexión con un token sin permisos elevados (el backend solo otorga `canPublish` con permiso de screen share cuando se reclama una solicitud aprobada; el token base de `join_room` no incluye eso).

## Detalles técnicos

```ts
// CoworkParticipantView.tsx
const prevScreenShareRef = useRef(false);

const handleMediaStateChange = useCallback((state) => {
  trackMediaState(state);
  // Detectar fin del screen share
  if (prevScreenShareRef.current && !state.screenShareOn && hasScreenShareAccess) {
    setHasScreenShareAccess(false);
    screenShareTokenRef.current = null;
    toast.info("Permiso de pantalla finalizado");
    // Reconectar con token estándar
    if (myRoom?.livekit_room_name) {
      setConnectedLkRoom(null);
      setTimeout(() => setConnectedLkRoom(myRoom.livekit_room_name), 300);
    }
  }
  prevScreenShareRef.current = state.screenShareOn;
}, [trackMediaState, hasScreenShareAccess, myRoom?.livekit_room_name]);
```

## Archivos a modificar
- `src/pages/cowork/CoworkParticipantView.tsx`

## Resultado esperado
El botón "Compartir pantalla" volverá a aparecer en la barra superior del participante apenas detenga el share, obligándolo a solicitar nuevamente la aprobación del coordinador para futuras transmisiones.
