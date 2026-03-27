

## Plan: Corregir sidebar cortado + permitir a admins eliminar cualquier conversación

### Problema 1: Sidebar cortado
El `ScrollArea` con `className="flex-1"` no funciona correctamente porque el contenedor padre `div.flex.flex-col.h-full` necesita `overflow-hidden` para que el flex-1 del ScrollArea se calcule bien y no se desborde.

### Solución sidebar
En `ChatSidebar.tsx` línea 153, agregar `overflow-hidden` al contenedor principal:
```
<div className="flex flex-col h-full bg-card/50 overflow-hidden">
```

### Problema 2: Admins no pueden eliminar conversaciones
En `ConversationItem` (línea 557), la opción de eliminar solo aparece si NO es grupo o si el usuario es admin **del grupo**. Un admin del sistema (rol `admin` en `user_roles`) no tiene acceso especial.

### Solución admin delete
1. Pasar `isAdmin` (del `useUserRole`) como prop desde `ChatSidebar` hasta `ConversationItem`
2. En la condición de línea 557, agregar `|| isAdmin` para que admins del sistema siempre vean la opción de eliminar

Flujo de props:
- `ChatSidebar` ya usa `useAuth`, agregar `useUserRole` para obtener `isAdmin`
- Pasar `isAdmin` a cada `ConversationItem`
- Cambiar condición: `{(isSystemAdmin || !isGroup || conversation.participants.find(...)) && ...}`

### Archivos
- **Modificar**: `src/pages/messenger/ChatSidebar.tsx`

