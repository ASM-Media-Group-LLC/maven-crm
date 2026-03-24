

## Plan: Rediseñar layout de /eventos y verificar funcionalidad de compartir

### Cambios de layout

#### 1. Calendario más compacto (`EventosCalendar.tsx`)
- Reducir padding del `CardContent` de `p-5` a `p-4`
- Reducir altura de las celdas del calendario de `h-11` a `h-9`
- Eliminar el footer con gradiente ("X eventos programados este mes") — ya está en el badge del header
- Reducir `mb-5` del header a `mb-3`
- Cambiar el grid de `lg:grid-cols-3` con sidebar de "Próximos eventos" a una sola fila: calendario a la izquierda (`lg:col-span-2`) y próximos eventos más compactos a la derecha, pero con altura limitada (`max-h-[320px] overflow-auto`)

#### 2. Quitar labels "Proyecto" y "Estado" (`EventosContent.tsx`)
- Eliminar los `<span>` con texto "Proyecto" y "Estado" (líneas 126 y 143)
- Dejar solo los tab bars directamente, sin label encima
- Poner ambos tab bars en una sola fila con `flex-row` y gap entre ellos para ahorrar espacio vertical

#### 3. Reducir spacing general
- Cambiar `space-y-6` del contenedor principal a `space-y-4`

### Verificación de funcionalidad de compartir

#### Compartir Agenda (funciona)
- El flujo `handleShareAgenda` en `EventosContent.tsx` crea/recupera un token de `agenda_share_tokens` y genera link a `/shared/agenda/:token`
- La página `SharedAgendaPage.tsx` llama al RPC `get_agenda_by_share_token` que valida el token y retorna eventos
- Todo está conectado correctamente

#### Compartir Evento individual (funciona)
- `EventoSharePage.tsx` llama al edge function `event-external-action` con GET para obtener info del evento por `external_token`
- El POST permite confirmar/cancelar asistencia
- El sharelink se copia desde `EventosTable.tsx` y `EventosGrid.tsx` usando `external_token`
- Depende de que cada evento tenga un `external_token` generado — si no lo tiene, muestra "No hay sharelink disponible"

Ambas funcionalidades están implementadas y conectadas. No hay bugs evidentes en el código.

### Archivos a modificar
1. **`src/pages/eventos/EventosCalendar.tsx`** — hacer calendario más compacto (padding, altura celdas, quitar footer redundante)
2. **`src/pages/eventos/EventosContent.tsx`** — quitar labels "Proyecto"/"Estado", poner tabs en una fila, reducir spacing

