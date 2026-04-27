## Problema

En el `CoworkHostDashboard`, al pulsar **"Atender"** sobre una solicitud:

- **Solicitud de ayuda (Hand)**: la tarjeta desaparece inmediatamente porque se llama a `resolveHostRequest`, dejando la lista limpia mientras el coordinador entra a la sala.
- **Solicitud de llamada privada (Phone)**: la tarjeta NO desaparece. Se llama a `ackHostRequest` (estado `acknowledged`), por lo que el render conmuta al segundo botón **"Unirse a llamada privada"** (captura `image-349.png`), aun cuando el coordinador ya fue llevado a la sala 1:1 en ese mismo click.

Esto resulta confuso: el botón "Unirse a llamada privada" aparece justo después de atender, como si la acción no hubiera surtido efecto.

## Causa

`src/pages/cowork/CoworkHostDashboard.tsx` líneas 254-283:

- Rama `is1on1` del botón "Atender" usa `ackHostRequest` (no resolver) + entra a la sala 1:1.
- Existe una segunda rama (`req.status === "acknowledged" && is1on1`) que renderiza "Unirse a llamada privada", pensada como **reconexión** si el coordinador abandona la sala 1:1 sin resolverla.
- Como tras "Atender" el estado pasa a `acknowledged`, ese segundo botón aparece de inmediato.

## Solución

Replicar el mismo patrón que la solicitud de ayuda: al pulsar **"Atender"** en una llamada privada, ocultar la tarjeta de la lista mientras el coordinador está dentro de la 1:1, y mostrar el botón de reconexión **únicamente** cuando realmente sea necesario (el coordinador salió de la 1:1 sin resolverla).

### Cambios en `src/pages/cowork/CoworkHostDashboard.tsx`

1. **Filtrar la lista `openHostRequests`** para ocultar la solicitud 1:1 que el coordinador está atendiendo en este momento (cuando `req.id === oneOnOneRequestId`). Así, al pulsar "Atender", la tarjeta desaparece igual que con una solicitud de ayuda.

2. **Mantener** la lógica actual de `ackHostRequest` + entrar a la sala 1:1 (no se cambia a `resolve` porque la solicitud debe seguir viva mientras dure la llamada para soportar reconexión).

3. **Conservar** el botón "Unirse a llamada privada" para el caso de reconexión: aparecerá solo cuando `status === "acknowledged"` Y `oneOnOneRequestId !== req.id` (es decir, el coordinador ya no está conectado a esa 1:1).

### Resultado esperado

- "Atender" en llamada privada → tarjeta desaparece de SOLICITUDES, coordinador entra a la 1:1. Mismo flujo visual que "Atender" en solicitud de ayuda.
- Si el coordinador minimiza/sale de la 1:1 sin resolverla → la tarjeta reaparece con el botón "Unirse a llamada privada" para reconectar.
- Al resolver/finalizar la 1:1 → la tarjeta desaparece definitivamente.

### Archivos a modificar

- `src/pages/cowork/CoworkHostDashboard.tsx` (1 archivo, ~5 líneas)
