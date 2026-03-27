

## Plan: Acciones completas en sidebar y header + sonidos de notificación

### 1. Agregar Fijar, Archivar y Eliminar al menú de 3 puntos del ChatHeader

**En `ChatHeader.tsx`:** Agregar nuevas props (`onTogglePin`, `isPinned`, `onDelete`, `onArchive`) y añadir al `DropdownMenuContent` existente (línea 171) las opciones:
- **Anclar/Desanclar** con icono `Pin`/`PinOff`
- **Archivar** con icono `Archive`
- **Eliminar** con icono `Trash2` (solo visible si admin del sistema o admin del grupo o chat directo)

**En `ChatView.tsx`:** Pasar las nuevas props desde ChatView a ChatHeader. Agregar props al interface de ChatView.

**En `MessengerPage.tsx`:** Pasar `isPinned`, `togglePin`, `handleDeleteChat` y un nuevo `handleArchive` a ChatView.

### 2. Agregar "Archivar" al ContextMenu del sidebar

**En `ChatSidebar.tsx`:** En el `ContextMenuContent` del `ConversationItem` (línea 544), añadir opción "Archivar" con icono `Archive` entre "Anclar" y "Eliminar".

### 3. Funcionalidad de Archivar

No existe tabla de archivado. Crear una tabla `chat_archived` similar a `chat_pinned`:
- `id`, `user_id`, `conversation_id`, `created_at`
- RLS: usuario solo ve/modifica sus propios registros

Crear hook `useArchivedChats.ts` (patrón idéntico a `usePinnedChats.ts`) con `toggleArchive`, `isArchived`.

En el sidebar, filtrar conversaciones archivadas de la lista principal y opcionalmente mostrar sección "Archivados" colapsable.

### 4. Sonidos de notificación en chat

**Crear `/public/sounds/message.mp3`**: Usar un sonido corto de notificación generado como data URI o un archivo estático simple.

**En `useBrowserNotifications.ts`:** Agregar reproducción de sonido en la función `notify`:
```ts
const audio = new Audio("/sounds/message.mp3");
audio.volume = 0.5;
audio.play().catch(() => {}); // catch para autoplay policy
```

El sonido se reproduce cuando llega un mensaje y el tab está oculto (misma condición que la notificación del navegador). También agregar sonido cuando el tab está visible pero el chat activo es diferente al del mensaje entrante.

**En `MessengerPage.tsx`:** Modificar `handleNewMessage` para reproducir sonido incluso cuando el tab está visible (siempre que no sea el chat activo).

### Archivos
- **Migración SQL**: crear tabla `chat_archived` con RLS
- **Crear**: `src/hooks/useArchivedChats.ts`
- **Crear**: `public/sounds/message.mp3` (sonido de notificación)
- **Modificar**: `src/hooks/useBrowserNotifications.ts` (agregar sonido)
- **Modificar**: `src/pages/messenger/components/ChatHeader.tsx` (acciones en dropdown)
- **Modificar**: `src/pages/messenger/ChatView.tsx` (pasar props)
- **Modificar**: `src/pages/messenger/MessengerPage.tsx` (conectar archive, pin, delete, sonido)
- **Modificar**: `src/pages/messenger/ChatSidebar.tsx` (archivar en context menu + filtrar archivados)

