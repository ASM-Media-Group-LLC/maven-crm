
# Reemplazar card de Clari AI por boton flotante animado

## Resumen

Se eliminara la card "Clari AI" del grid de cards operacionales y se agregara un boton flotante (FAB) fijo en la esquina inferior derecha del Dashboard. Al hacer clic, se abrira un panel lateral (sheet/drawer) con el chat de IA integrado directamente, sin necesidad de navegar a `/aisales`.

## Cambios

### 1. Eliminar card "Clari AI" de `SalesOperationalCards.tsx`

Remover el objeto con `id: "clari_ai"` del array de cards. El grid pasara de 8 a 7 cards.

### 2. Crear componente `ClariAiFab.tsx`

Nuevo componente de boton flotante con las siguientes caracteristicas:

**Visual:**
- Posicion fija en esquina inferior derecha (`fixed bottom-6 right-6`)
- Boton circular con icono de Bot y gradiente primary
- Animacion de "pulse" sutil continua (`animate-pulse` o keyframe custom con scale)
- Hover: escala 1.1 con sombra ampliada
- Badge opcional con texto "AI" o punto indicador

**Comportamiento:**
- Al hacer clic abre un `Sheet` (panel lateral derecho) con el chat de IA embebido
- El chat reutiliza toda la logica de streaming que ya existe en `AiSales.tsx` (se extraera la logica del chat a un componente reutilizable `ClariAiChat.tsx`)
- Al cerrar el sheet, el estado de la conversacion se mantiene mientras el usuario este en la pagina

### 3. Crear componente `ClariAiChat.tsx`

Extraer la logica del chat de `AiSales.tsx` a un componente reutilizable que funcione tanto en la pagina completa (`/aisales`) como dentro del sheet del FAB:

- Recibe como prop opcional la altura/modo (full page vs panel)
- Contiene: mensajes, input, streaming, scroll automatico
- Reutiliza `streamChat`, `WELCOME`, `getAiConfig`

### 4. Integrar FAB en `SalesOverview.tsx`

Agregar el componente `ClariAiFab` dentro del layout principal del Dashboard, posicionado de forma absoluta respecto al area de contenido.

### 5. Actualizar `AiSales.tsx`

Refactorizar para usar el nuevo `ClariAiChat.tsx` en lugar de tener la logica duplicada.

## Archivos a crear

- `src/components/ClariAiChat.tsx` -- componente reutilizable del chat con toda la logica de streaming
- `src/components/ClariAiFab.tsx` -- boton flotante animado + Sheet con ClariAiChat embebido

## Archivos a modificar

- `src/pages/sales-overview/SalesOperationalCards.tsx` -- eliminar card "clari_ai"
- `src/pages/SalesOverview.tsx` -- agregar ClariAiFab al layout
- `src/pages/AiSales.tsx` -- refactorizar para usar ClariAiChat

## Detalles tecnicos

- El FAB usa `z-50` para estar por encima del contenido pero por debajo de modales
- El Sheet usa el componente existente de shadcn (`@/components/ui/sheet`) con `side="right"` y ancho de `w-[420px]`
- La animacion del FAB es un keyframe CSS custom que alterna entre `scale(1)` y `scale(1.05)` con `box-shadow` pulsante en color primary
- El estado del chat (mensajes) se mantiene en el componente FAB con useState, asi que persiste mientras el usuario no recargue la pagina
- Se agrega `animate-clari-pulse` en `index.css` o `tailwind.config.ts` como keyframe custom
