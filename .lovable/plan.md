

## Plan: Deep link de notificaciones de anuncios al detalle del anuncio

### Problema
Cuando llega una notificación de un anuncio de RRHH, al hacer click no lleva al anuncio específico sino al módulo general de comunicación.

### Cambios

#### 1. Agregar ruta `announcement` en `resolveDeepLink` (`src/lib/notificationHelpers.ts`)
- Añadir entrada: `announcement: /hr/anuncios?id=${referenceId}`

#### 2. Leer query param `id` en `HRAnnouncements.tsx`
- Al cargar la página, leer `?id=` de la URL
- Buscar el anuncio correspondiente en la lista cargada
- Abrir automáticamente el `AnnouncementDetailModal` con ese anuncio como `detailTarget`
- Limpiar el param de la URL después de abrirlo

#### 3. Verificar creación de notificaciones para anuncios
- Actualmente no existe un trigger que cree notificaciones al publicar un anuncio con canal "notification". Si se quiere que esto funcione end-to-end, se necesitaría un trigger SQL o lógica en el frontend al crear/activar el anuncio. Esto es un paso adicional que se puede abordar después si se desea.

### Archivos

| Archivo | Cambio |
|---|---|
| `src/lib/notificationHelpers.ts` | Agregar ruta `announcement` |
| `src/pages/hr/HRAnnouncements.tsx` | Leer `?id=` y abrir detalle automáticamente |

