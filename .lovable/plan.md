# Atender solicitudes con ingreso directo a la sala

## Problema
En el Coordinador Dashboard, las solicitudes de ayuda (botón "Pedir Host" desde el participante) tienen dos variantes:

- **Llamada privada (1-on-1)**: al presionar "Atender" el coordinador ya entra automáticamente a una sala privada con el participante. ✅
- **Solicitud normal**: al presionar "Atender" solo se marca como "acknowledged", pero el coordinador no entra a ninguna sala. El coordinador tiene que ubicar manualmente la sala del participante y entrar. ❌

El usuario quiere que al presionar "Atender" en cualquier solicitud, el coordinador **entre directamente** a la sala del participante.

## Cambio propuesto

En `src/pages/cowork/CoworkHostDashboard.tsx`, en el handler del botón **"Atender"** (línea ~280), extender el comportamiento:

- Si `is1on1` (llamada privada) → mantener el comportamiento actual (entra a la sala privada).
- Si **NO** es 1-on-1 → tras llamar `ackHostRequest`, ejecutar `enterRoom(req.room_id)` para que el coordinador ingrese de forma inmediata a la sala donde está el participante que pidió ayuda.

`enterRoom` ya existe en el archivo (línea 65) y resuelve la sala de LiveKit a partir del `room_id`, fija el nombre y minimiza el Hub — exactamente la misma experiencia que cuando el coordinador hace clic manualmente en una tarjeta de sala.

## Resultado esperado

1. Participante en "Sala 1" presiona "Pedir Host" → aparece tarjeta "Solicitudes (1)" en el dashboard.
2. Coordinador presiona **Atender** → la solicitud queda marcada como atendida **y** el coordinador entra directamente a Sala 1 (vista LiveKit, Hub minimizado).
3. El botón **Resolver** sigue funcionando igual para cerrar la solicitud sin entrar.

## Archivos afectados
- `src/pages/cowork/CoworkHostDashboard.tsx` (un solo handler, ~5 líneas modificadas)

No se requieren cambios en hooks, edge functions ni base de datos.
