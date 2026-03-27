

## Plan: Agregar botón de 3 puntos a las conversation cards + verificar sonido de notificaciones

### Problema 1: Sin menú de 3 puntos en el sidebar
Las acciones (anclar, archivar, eliminar) solo están disponibles via **ContextMenu** (clic derecho), que no es descubrible en móvil ni intuitivo. Se necesita un botón de 3 puntos visible al hacer hover sobre cada conversation card.

### Problema 2: Sonido de notificaciones
El código de sonido está correcto: `playNotificationSound()` se llama en `notify()` que se invoca en `handleNewMessage` cuando llega un mensaje a un chat diferente al activo. El archivo `/sounds/message.wav` existe. El sonido debería funcionar siempre que el navegador haya tenido una interacción previa del usuario (política de autoplay). Se verificará en el navegador.

### Solución sidebar — botón de 3 puntos

**En `ChatSidebar.tsx`, dentro del `ConversationItem`:**

Agregar un botón `MoreVertical` que aparezca en hover (esquina superior derecha del card), envuelto en un `DropdownMenu` con las mismas opciones que el `ContextMenu`:
- Anclar / Desanclar
- Archivar / Desarchivar
- Eliminar (condicional por permisos)

```text
┌──────────────────────────────────┐
│ 👤 Jonathan Pacheco    18:48  ⋮  │  ← ⋮ visible on hover
│    Videollamada iniciada...      │
└──────────────────────────────────┘
```

El botón se posiciona con `absolute top-1 right-1` dentro del card (que ya es `group` para hover). Se muestra con `opacity-0 group-hover:opacity-100`. En móvil, se muestra siempre con `sm:opacity-0 sm:group-hover:opacity-100`.

Las opciones del `DropdownMenu` replican exactamente las del `ContextMenuContent` existente para evitar duplicación de lógica.

### Verificación de sonido
Usar las herramientas del navegador para confirmar que el archivo de audio se carga correctamente y que `notify()` se ejecuta al recibir mensajes.

### Archivo
- **Modificar**: `src/pages/messenger/ChatSidebar.tsx` — agregar `DropdownMenu` con `MoreVertical` al `ConversationItem`

