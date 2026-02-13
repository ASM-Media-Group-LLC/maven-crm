

## Hover en tarjetas de Promolog + Modal "Editar Promocion"

### 1. Hover en PromologEntryCard

Segun el sistema de diseno, las tarjetas usan cambios de fondo o bordes sutiles en hover (no sombras). Se agregara al componente Card en `PromologEntryCard.tsx` la clase `transition-colors hover:bg-muted/50` para un efecto de fondo sutil al pasar el cursor.

**Archivo:** `src/pages/promolog/PromologEntryCard.tsx`

### 2. Modal "Editar Promocion"

Se creara un modal (Dialog) que se abre al hacer clic en "Editar" con la siguiente estructura segun la imagen de referencia:

- **Titulo:** "Editar Promocion" (con pr-8 para no chocar con el boton X)
- **Card de creador:** Fondo oscuro/muted con Avatar (iniciales), nombre completo y handle con icono de red social
- **Seccion "¿Promociono Hoy?":** Dos botones grandes lado a lado:
  - "Si Promociono" (fondo cyan/primary, con icono check) 
  - "No Promociono" (fondo purple, con icono X)
  - Seleccion toggle: al hacer clic en uno se resalta y el otro se desactiva
- **Seccion "Red Social *":** 4 botones en fila horizontal (Instagram, TikTok, X, Telegram) con iconos, seleccion toggle
- **Footer:** Botones "Cancelar" (outline) y "Guardar Cambios" (primary/cyan)

### Detalle Tecnico

**Archivo:** `src/pages/promolog/PromologEntryCard.tsx`

Cambios:
- Agregar estado `editOpen` para controlar el modal
- Conectar boton "Editar" con `onClick={() => setEditOpen(true)}`
- Agregar estados locales para la seleccion: `editResult` (si/no) y `editNetwork` (instagram/tiktok/x/telegram)
- Inicializar estados con los valores actuales del entry
- Importar Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
- Agregar clase hover al Card: `transition-colors hover:bg-muted/50`

Estructura del modal:
```
Dialog
  DialogContent (max-w-lg)
    DialogHeader
      DialogTitle "Editar Promocion"
    Card con avatar + nombre + handle
    Seccion "¿Promociono Hoy?"
      2 botones toggle (Si / No)
    Seccion "Red Social *"
      4 botones toggle (Instagram, TikTok, X, Telegram)
    DialogFooter
      Button "Cancelar" (outline)
      Button "Guardar Cambios" (primary, bg-cyan-500)
```

Los botones de seleccion usaran estilos condicionales: el seleccionado tendra fondo de color (cyan para "Si", purple para "No", y borde primary para red social), mientras que los no seleccionados tendran variant outline.
