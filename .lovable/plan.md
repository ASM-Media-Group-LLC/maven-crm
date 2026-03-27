

## Plan: Corregir audio en videollamadas

### Diagnóstico

El problema está en `ParticipantTile.tsx` líneas 145-162. El pipeline de ganancia (gain boost 1.4x) reemplaza el `srcObject` del elemento `<audio>` con un stream procesado por `AudioContext`. Si el `AudioContext` queda en estado **suspended** (política de autoplay del navegador), el stream de destino produce **silencio total** — y el stream original de LiveKit ya fue reemplazado.

Flujo actual problemático:
```text
LiveKit track → attach(audioEl) → srcObject = originalStream
                                → AudioContext.createMediaStreamSource(originalStream)
                                → GainNode(1.4) → destination
                                → audioEl.srcObject = destination.stream  ← SI AudioContext está suspended, SILENCIO
```

Además, se crea un `AudioContext` nuevo por cada participante remoto, lo que puede exceder el límite del navegador (~6 contextos simultáneos).

### Solución

**1. Compartir un solo AudioContext global** entre todos los participantes para evitar el límite del navegador.

**2. Verificar que el AudioContext esté "running" antes de reemplazar el srcObject.** Si no se puede resumir, mantener el stream original sin boost (audio a volumen normal es mejor que silencio).

**3. Agregar listener de interacción del usuario** para resumir AudioContexts suspendidos (click/keydown).

### Cambios en `ParticipantTile.tsx`

Refactorizar `attachAudioTrack` (líneas 134-162):

```ts
// Crear/reutilizar AudioContext compartido
const sharedAudioCtx = getOrCreateSharedAudioContext(); // módulo-level singleton

// Solo aplicar gain boost si el contexto está running
if (sharedAudioCtx.state === "running") {
  const source = sharedAudioCtx.createMediaStreamSource(audioEl.srcObject as MediaStream);
  const gainNode = sharedAudioCtx.createGain();
  gainNode.gain.value = 1.4;
  const destination = sharedAudioCtx.createMediaStreamDestination();
  source.connect(gainNode).connect(destination);
  audioEl.srcObject = destination.stream;
} else {
  // Intentar resumir, y si se logra, aplicar boost después
  sharedAudioCtx.resume().then(() => {
    // re-apply gain on next cycle
  });
  // Mientras tanto, mantener el stream original (audio sin boost pero audible)
}
```

Crear helper `getOrCreateSharedAudioContext()` que:
- Reutilice un singleton
- Escuche eventos de interacción (`click`, `touchstart`) para `resume()` automático
- Limpie el singleton solo cuando se cierre la página de llamada

### Cleanup en unmount

Actualizar el cleanup (líneas 283-311) para desconectar solo los nodos individuales (source, gain) sin cerrar el AudioContext compartido.

### Archivos
- **Modificar**: `src/pages/messenger/videocall/ParticipantTile.tsx`

