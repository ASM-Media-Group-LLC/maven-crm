

# Plan: Corregir bloqueo de cursor en IA Ventas Chat

## Problemas identificados

### 1. ScrollArea ref apunta al elemento incorrecto
`ClariAiChat` pasa `ref={scrollRef}` al componente `ScrollArea`, pero este ref apunta al `Root` de Radix (un div contenedor), **no al Viewport** (el elemento que realmente tiene scroll). Cuando se llama `scrollRef.current?.scrollTo()`, no tiene efecto real porque Root no es scrollable. Esto causa que el chat no haga auto-scroll y puede generar comportamientos extraños con la interacción del mouse.

### 2. Doble useEffect causa re-renders innecesarios
Los dos `useEffect` en líneas 123-134 y 137-141 **ambos** actualizan `localMessages` cuando `dbMessages` cambia. Esto provoca renders duplicados cada vez que se selecciona un chat, haciendo que la UI se sienta trabada momentáneamente.

### 3. Textarea disabled con cursor-not-allowed
Cuando no hay conversación activa, el textarea muestra `cursor-not-allowed` que da sensación de "bloqueado". Mejor UX: al hacer clic en el textarea sin chat activo, crear automáticamente uno nuevo.

## Cambios

### `ClariAiChat.tsx`
- **Eliminar el doble useEffect**: Unificar en un solo efecto que sincroniza `localMessages` con `dbMessages`
- **Corregir auto-scroll**: Usar un ref interno al Viewport del ScrollArea en lugar del Root. Cambiar de `ScrollArea` a un div con `overflow-y-auto` y ref directo, o exponer el Viewport ref
- **Auto-crear chat**: Cuando el usuario escribe sin conversación activa (en modo full), disparar la creación automática del chat en vez de mostrar textarea disabled

### `scroll-area.tsx` (opcional)
- Exponer el `Viewport` ref como prop para casos donde se necesita scroll programático

## Resultado esperado
- El cursor no se bloquea al entrar a un chat
- Auto-scroll funciona correctamente al cargar mensajes
- El usuario puede empezar a escribir directamente sin tener que crear un chat primero

