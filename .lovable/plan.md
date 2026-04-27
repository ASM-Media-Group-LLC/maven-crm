# Plan: Renombrar "Host Hub" a "Coordinador Hub" (solo UI)

## Objetivo
Cambiar únicamente el texto visible al usuario de **"Host Hub"** a **"Coordinador Hub"** dentro del módulo Cowork. No se tocan nombres de variables, columnas de DB (`host_hub_livekit_room`), endpoints, ni lógica.

## Archivo afectado
`src/pages/cowork/CoworkHostDashboard.tsx`

## Cambios exactos (3 strings de UI)

| Línea | Antes | Después |
|------|-------|---------|
| 196 | `<span>Host Hub</span>` (indicador en la barra superior) | `<span>Coordinador Hub</span>` |
| 496 | `Host Hub` (título del pop-up flotante) | `Coordinador Hub` |
| 530 | `callDisplayName="Host Hub"` (nombre mostrado dentro de la videollamada) | `callDisplayName="Coordinador Hub"` |

## Lo que NO se cambia
- Variables de estado (`hubConnected`, `hubMinimized`, `hubMaximized`)
- Función `getHubToken` y acción `"join_host_hub"` del backend
- Columna de DB `host_hub_livekit_room` y tipos en `supabase/types.ts`
- El texto corto `"Hub"` en línea 482 (botón minimizado, ya es genérico — se mantiene por espacio)
- Comentarios internos del código

## Resultado visual
La barra de estado del Host Dashboard mostrará "Coordinador Hub" (donde antes decía "Host Hub"), el pop-up flotante de la sala persistente del coordinador llevará el título "Coordinador Hub", y el nombre dentro de la videollamada también aparecerá como "Coordinador Hub".

> Nota: para cambios de texto puntuales como este puedes usar **Visual Edits** (botón Edit en la barra inferior del chat) — seleccionas el texto en la página y lo editas gratis, sin gastar créditos.
