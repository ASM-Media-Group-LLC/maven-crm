## Problema detectado

En `CoworkHostDashboard.tsx`, cuando el coordinador entra a una sala (`enterRoom`), el componente `<LiveKitCallView>` del **Coordinador Hub** (`cowork_hub_<sessionId>`) **se minimiza pero permanece montado y conectado** a LiveKit. Esto provoca:

1. **Dos conexiones LiveKit simultáneas en una sola pestaña** del coordinador (Hub + sala activa). Ambas instancias llaman a `setMicrophoneEnabled(true)` sobre el mismo dispositivo físico → la segunda toma el control del track y la primera queda en silencio (o viceversa). Resultado: **al activar el mic, no se publica audio en la sala donde están los participantes**.

2. **Aislamiento por diseño en LiveKit**: el Hub (`cowork_hub_*`) y las salas (`cowork_<id>_<i>`) son rooms LiveKit **distintos**. Aunque el mic publique en el Hub, ningún participante de una sala lo oirá — sólo otros coordinadores en el Hub.

3. Para los **participantes**: si tienen `hideNoVideo` activado en "Ajustar vista" y un par está sin cámara, su tile no se monta → el `<audio>` no se adjunta → no se escucha. Es un caso secundario pero conviene blindar.

Además, no hay un único elemento de audio global por sala que sirva como "red de seguridad" si un tile no se monta a tiempo.

## Cambios propuestos

### 1. `CoworkHostDashboard.tsx` — desconectar el Hub al entrar a una sala (y reconectarlo al salir)

- En `enterRoom()`: además de minimizar, **`setHubConnected(false)`** para desmontar el Hub y liberar el micrófono.
- En `leaveActiveRoom()`: **reconectar el Hub** (`setHubConnected(true)` y `setHubMinimized(false)`) para que el coordinador vuelva al canal de coordinación.
- Razonamiento: una pestaña sólo puede publicar un track de micrófono confiablemente en una sala LiveKit a la vez. El coordinador alterna entre Hub ↔ Sala.

### 2. `CoworkHostDashboard.tsx` — UX visible del estado

- Mientras el coordinador está dentro de una sala, mostrar un pequeño indicador en el sidebar ("Hub en pausa — saldrás de la sala para regresar al Hub") en lugar del botón "Hub".
- Al pulsar "Salir" de la sala, mostrar toast: "Volviendo al Coordinador Hub".

### 3. `LiveKitCallView.tsx` — capa de audio remoto a nivel de sala (red de seguridad)

Añadir un `<RoomAudioRenderer>`-equivalente: un único componente que se suscribe a todos los `RemoteAudioTrack` de la sala y los adjunta a elementos `<audio>` ocultos, independientemente de qué tiles estén visibles. Esto asegura que:
- Un participante audible aunque su tile esté filtrado por `hideNoVideo` o no esté en `maxTiles`.
- No se duplica el audio (el tile sigue adjuntando para `setSinkId` por participante; el renderer global usa una clave por SID y se desactiva si el tile ya tiene el track adjuntado, o mutea el global cuando el tile lo toma).

Implementación mínima: nuevo componente `RoomAudioSink.tsx` que escucha `RoomEvent.TrackSubscribed` / `TrackUnsubscribed` filtrando `Track.Source.Microphone`, y adjunta a un `<audio autoPlay>` por SID. Se monta una sola vez dentro de `LiveKitCallView`.

### 4. Verificación de `Room.startAudio()` tras toggle

Asegurar que después de `toggleMic` (lado coordinador) se invoca `room.startAudio()` si `!room.canPlaybackAudio` (algunos navegadores requieren un gesto de usuario reciente para reproducir audio remoto). Ya existe el listener; añadir llamada explícita en el primer `toggleMic` exitoso por sesión.

## Detalles técnicos

- Archivos a modificar:
  - `src/pages/cowork/CoworkHostDashboard.tsx` (lógica enter/leave + indicador)
  - `src/pages/messenger/videocall/LiveKitCallView.tsx` (montar `RoomAudioSink`)
  - `src/hooks/useLiveKit.ts` (forzar `startAudio()` en primer `toggleMic`)
  - `src/pages/messenger/videocall/RoomAudioSink.tsx` (nuevo)

- No se requieren cambios en la edge function `livekit-token` ni en el esquema DB. Los grants ya son correctos (`canPublish: true`, `canSubscribe: true`).

- Comportamiento esperado tras el fix:
  - Coordinador en Hub: oye y habla con otros coordinadores del Hub.
  - Coordinador entra a Sala A: el Hub se desconecta automáticamente, el mic publica en Sala A; los participantes de A lo oyen y él los oye.
  - Coordinador sale de Sala A: vuelve al Hub automáticamente.
  - Participantes en una sala: se oyen entre sí sin requerir cámara encendida.

## Fuera de alcance

- Permitir al coordinador estar en Hub y en una sala simultáneamente (requeriría una segunda pestaña/contexto de audio o mezclar mics, fuera del modelo actual de LiveKit por pestaña).
