## Objetivo

En el Coordinador Dashboard, las solicitudes de "Pedir Host" deben:
1. **No mostrar el botón "Resolver"** (se elimina de la UI).
2. **Desaparecer automáticamente** una vez que el coordinador presiona **"Atender"**.

## Estado actual

Archivo: `src/pages/cowork/CoworkHostDashboard.tsx`

- Línea 122: `openHostRequests = hostRequests.filter(r => r.status !== "resolved")` — muestra tanto `open` como `acknowledged`.
- Línea 280-294: botón **Atender** llama `ackHostRequest` (status pasa a `acknowledged`, sigue visible) y luego `enterRoom` (o flujo 1-on-1).
- Línea 296-307: botón **Unirse a llamada privada** (visible solo para 1-on-1 ya atendidas).
- Línea 308-316: botón **Resolver** llama `resolveHostRequest` (status pasa a `resolved`, desaparece).

## Cambios propuestos

En `CoworkHostDashboard.tsx`, dentro del bloque de Host Requests (líneas 278-317):

1. **Eliminar el botón "Resolver"** (líneas 308-316) por completo.

2. **Reemplazar `ackHostRequest` por `resolveHostRequest`** en el handler de "Atender":
   - Para solicitudes normales: tras entrar a la sala con `enterRoom(req.room_id)`, llamar `resolveHostRequest(req.id)` para que la tarjeta desaparezca de inmediato.
   - Para solicitudes 1-on-1: mantener `ackHostRequest` (no resolver todavía), porque la sala privada se cierra con `leaveOneOnOne` que ya invoca `resolveHostRequest` (línea 92). Eso conserva la tarjeta como "Unirse a llamada privada" durante la llamada activa.

3. **Eliminar la condición `req.status === "open"`** del botón Atender para solicitudes normales — al ya no haber estado intermedio para no-1on1, el render queda más limpio. (Para 1-on-1 la condición se mantiene para ocultar Atender una vez que pasa a `acknowledged` y mostrar "Unirse a llamada privada".)

### Comportamiento resultante

- **Solicitud normal**: Coordinador ve "Atender" → click → entra a la sala + tarjeta desaparece. ✅
- **Solicitud 1-on-1**: Coordinador ve "Atender" → click → entra a sala privada + tarjeta cambia a "Unirse a llamada privada" (por si se sale y quiere reincorporarse) → al colgar/salir se resuelve y desaparece. ✅
- **Botón Resolver**: ya no existe en la UI. ✅

## Archivos modificados

- `src/pages/cowork/CoworkHostDashboard.tsx` (~10 líneas dentro del bloque de Host Requests).

No hay cambios en hooks, edge functions ni base de datos.
