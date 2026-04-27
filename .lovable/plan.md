## Cambios UI/UX en llamada privada con coordinador

### 1. Renombrar textos "host" → "coordinador" (vista participante)

En `src/pages/cowork/CoworkParticipantView.tsx`:
- Topbar (línea 288): `"Llamada privada con host"` → `"Llamada privada con coordinador"`.
- `callDisplayName` del `LiveKitCallView` 1:1 (línea 359): `"Llamada privada con host"` → `"Llamada privada con coordinador"`.
- Toast finalizada (línea 180): `"Llamada privada con host finalizada"` → `"Llamada privada con coordinador finalizada"`.
- Toast solicitud enviada (línea 248): `"Solicitud de llamada privada enviada al host"` → `"… enviada al coordinador"`.
- Botones desktop / dropdown mobile:
  - `"Pedir host"` → `"Pedir coordinador"` (líneas 306 y 335).
  - `"Llamada privada con host"` (item dropdown línea 339) → `"Llamada privada con coordinador"`.
  - Botón reconectar (línea 302): `"Reconectar a llamada privada"` se mantiene (ya no menciona host).
- Estado de espera (línea 224): `"Esperando asignación de sala por el host..."` → `"… por el coordinador..."`.

No se cambian nombres de variables/handlers (`requestHost`, `hostRequests`, etc.) para no tocar el hook ni el edge function — solo strings visibles.

### 2. Botón "Regresar a la sala" mientras se está en llamada 1:1

Hoy `CallControls` siempre muestra un botón rojo redondo con `PhoneOff`. Para la llamada privada queremos un botón ancho con icono + texto "Regresar a la sala".

Cambios en `src/pages/messenger/videocall/CallControls.tsx`:
- Añadir prop opcional `leaveLabel?: string` y `leaveIcon?: LucideIcon` (default `PhoneOff`) en `CallControlsProps`.
- En el render del botón leave (líneas 343–354): si `leaveLabel` está definido, renderizar el icono + `<span>{leaveLabel}</span>` y mantener estilos rojos. Si no, comportamiento actual (solo icono).

Cambios en `src/pages/messenger/videocall/LiveKitCallView.tsx`:
- Añadir props `leaveLabel?: string` y `leaveIcon?` y pasarlas a `CallControls`.

Cambios en `src/pages/cowork/CoworkParticipantView.tsx`:
- En el `LiveKitCallView` del bloque `isInOneOnOne` (línea ~352), pasar `leaveLabel="Regresar a la sala"` y `leaveIcon={ArrowLeft}` (importar de `lucide-react`). El `onLeave` existente ya devuelve al participante a la sala principal, así que no se requiere lógica adicional.
- En el `LiveKitCallView` de la sala normal NO se pasa `leaveLabel` → mantiene el icono rojo de colgar actual.

### Archivos modificados
- `src/pages/cowork/CoworkParticipantView.tsx`
- `src/pages/messenger/videocall/CallControls.tsx`
- `src/pages/messenger/videocall/LiveKitCallView.tsx`
