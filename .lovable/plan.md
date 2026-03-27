

## Plan: Mejorar UI del sidebar del Messenger + verificar audio en videollamadas

### Problema 1: Cards de conversación cortadas en el sidebar

En la screenshot se ve que las conversation cards del sidebar se cortan en la parte inferior. El `ChatSidebar` usa `ScrollArea className="flex-1"` (línea 190), pero el contenido dentro del ScrollArea no tiene padding inferior suficiente, por lo que la última conversación queda parcialmente oculta detrás del borde del viewport.

### Solución sidebar

**En `ChatSidebar.tsx`:**
- Agregar `pb-6` al `div` interior del `ScrollArea` (línea 191, actualmente `pb-2`) para dar espacio de respiro al final del scroll
- Asegurar que el `ScrollArea` tenga `overflow-hidden` en su wrapper para evitar desbordamiento visual

### Problema 2: Audio en videollamadas

El código actual del audio en `ParticipantTile.tsx` ya fue corregido con el `AudioContext` compartido singleton. Sin embargo, hay un problema potencial: el `GainNode` y el pipeline se crean pero **no se almacenan en refs**, por lo que no pueden limpiarse individualmente. Solo `gainSourceRef` (el source node) se guarda, pero el `GainNode` se pierde.

### Solución audio

**En `ParticipantTile.tsx`:**
- Agregar un `gainNodeRef` para almacenar el `GainNode` y poder desconectarlo en cleanup
- En el cleanup (línea 338), desconectar tanto `gainSourceRef` como `gainNodeRef`
- Agregar un log de debug temporal (`console.debug`) al attach de audio para facilitar verificación

### Archivos
- **Modificar**: `src/pages/messenger/ChatSidebar.tsx` — padding inferior del ScrollArea
- **Modificar**: `src/pages/messenger/videocall/ParticipantTile.tsx` — cleanup correcto del GainNode

