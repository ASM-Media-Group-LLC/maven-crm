

## Plan: Corregir audio silenciado en videollamadas

### Problema identificado

Hay dos causas probables de silencio total:

**1. Gain boost mata el audio cuando AudioContext se suspende**
En `ParticipantTile.tsx` línea 184-195, cuando el `AudioContext` está "running", el código reemplaza el `srcObject` del audio element con un stream procesado por Web Audio API. Si el AudioContext se suspende después (tab en background, política del navegador), el pipeline deja de procesar y el audio element reproduce silencio — y el stream original de LiveKit ya fue reemplazado, no hay fallback.

**2. Cancelación de ruido demasiado agresiva en el sender**
`loadNCPreference()` retorna `true` por defecto (cuando no hay valor en localStorage). El worklet aplica un noise gate que podría silenciar voces suaves. Si el worklet falla al cargar, `setProcessor` podría dejar el track en un estado roto.

### Solución

#### 1. `ParticipantTile.tsx` — Eliminar gain boost, reproducir audio directo
- Eliminar toda la lógica de `sharedAudioCtx`, `gainNode`, `MediaStreamAudioDestinationNode`
- Dejar que LiveKit maneje el audio directamente: `audioTrack.track.attach(audioEl)` + `audioEl.play()`
- Esto elimina la dependencia del AudioContext para la reproducción
- El gain de 1.4x (+3dB) no justifica el riesgo de silenciar todo el audio

#### 2. `src/hooks/useLiveKit.ts` — Hacer noise cancellation opt-in, no opt-out
- Cambiar `loadNCPreference()` para que retorne `false` cuando no hay valor guardado (en vez de `true`)
- Agregar mejor manejo de errores en `setProcessor`: si falla, asegurar que el track sigue publicando sin procesador

#### 3. `src/lib/noise-suppression-processor.ts` — Cambiar default
- Línea 102: cambiar `return val === null ? true : val === "true"` a `return val === "true"` (default a desactivado)

### Archivos a modificar
- `src/pages/messenger/videocall/ParticipantTile.tsx` — eliminar gain boost pipeline
- `src/lib/noise-suppression-processor.ts` — cambiar default NC a false

