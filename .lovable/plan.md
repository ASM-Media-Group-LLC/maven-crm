

## Plan: Separar botones de "Nuevo Chat Directo" y "Nuevo Grupo" en Messenger

### Problema
El sidebar del messenger solo tiene un botón (MessageSquarePlus) que siempre abre el modal en modo grupo (`isGroup={true}`). No hay forma de iniciar un chat directo 1-a-1 desde la UI, aunque la lógica (`handleSelectUser` → `createDirectChat`) ya existe.

### Solución

#### 1. `ChatSidebar.tsx` — Agregar botón de nuevo chat directo
- Agregar una nueva prop `onNewChat: () => void`
- Agregar un segundo botón junto al de "Nuevo grupo", con ícono `MessageCirclePlus` o similar, con title "Nuevo chat"
- El botón de grupo se mantiene con su ícono actual (`MessageSquarePlus`) y title "Nuevo grupo"

#### 2. `MessengerPage.tsx` — Agregar estado y modal para chat directo
- Agregar estado `newChatOpen` (boolean)
- Pasar `onNewChat={() => setNewChatOpen(true)}` al sidebar
- Agregar un segundo `<NewChatModal>` con `isGroup={false}`, `onSelectUser={handleSelectUser}` (en vez del `() => {}` actual)
- Alternativamente, reusar el mismo modal con una variable que controle si es grupo o directo

### Resultado
- Dos botones claros: uno para chat directo (seleccionar usuario → abre conversación 1-a-1) y otro para crear grupo
- El modal de chat directo muestra la lista de usuarios y al hacer clic en uno se abre/crea la conversación directa

### Archivos a modificar
- `src/pages/messenger/ChatSidebar.tsx` — nueva prop + botón
- `src/pages/messenger/MessengerPage.tsx` — estado + modal para chat directo

