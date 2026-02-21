

## Extender vista de detalle a ancho completo

El contenido de la vista de detalle del agente esta limitado por la clase `max-w-5xl` en la linea 185 del archivo `AgentDetailSheet.tsx`. Esto impide que el contenido ocupe todo el espacio horizontal disponible.

### Cambio

**`src/pages/hr/AgentDetailSheet.tsx`** (linea 185):

Eliminar `max-w-5xl` del div contenedor del contenido scrollable, dejando que ocupe todo el ancho disponible.

```text
// Antes
<div className="space-y-6 max-w-5xl">

// Despues
<div className="space-y-6">
```

Es un cambio de una sola linea. El resto del componente se mantiene intacto.

