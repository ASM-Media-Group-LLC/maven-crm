

# Plan: Corregir envío en IA Ventas + Tooltips ocultos en Dashboard2

## Problema 1: Mensajes no se envían en IA Ventas

El botón Send tiene `disabled={!input.trim() || isLoading || !canChat}`, y `canChat = isPanel || !!conversationId`. En modo full (no panel), si no hay conversación seleccionada, `canChat` es `false` y el botón queda deshabilitado. Aunque el plan anterior mencionaba auto-crear chat al escribir, el textarea no está disabled pero **el botón sí lo está**, así que el usuario escribe pero no puede enviar.

**Solución**: Cuando el usuario intente enviar sin `conversationId` (modo full), auto-crear una conversación primero y luego enviar el mensaje. Esto requiere:

- Pasar un callback `onAutoCreate` desde `AiSales.tsx` a `ClariAiChat`
- En `ClariAiChat.send()`, si `!conversationId` y hay un `onAutoCreate`, llamarlo primero, obtener el nuevo ID, y proceder con el envío
- Eliminar la condición `!canChat` del disabled del botón Send (mantener solo `!input.trim() || isLoading`)

## Problema 2: Tooltips ocultos bajo el topbar en Dashboard2

Los tooltips en la barra de herramientas (líneas 538-611) usan `side="bottom"` o el default (top). Como están cerca del topbar sticky, los tooltips con `side` default (top) pueden quedar tapados por el header.

**Solución**: Agregar `side="bottom"` a todos los `TooltipContent` en esa zona de toolbar para que aparezcan debajo de los botones en vez de arriba (donde colisionan con el topbar). También agregar `className="z-50"` para asegurar que queden por encima de otros elementos.

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `ClariAiChat.tsx` | Aceptar prop `onAutoCreate`, auto-crear conversación al enviar sin ID activo, quitar `!canChat` del disabled |
| `AiSales.tsx` | Pasar callback `onAutoCreate` que crea conversación y retorna el ID |
| `Dashboard2.tsx` | Agregar `side="bottom"` a todos los TooltipContent de la toolbar |

