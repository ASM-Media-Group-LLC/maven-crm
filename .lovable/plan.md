

## Fix: Modal "Nueva Solicitud de Contenido" cortado

### Problema

El modal tiene demasiado contenido vertical (titulo, descripcion, tipo, prioridad, creadora, chatter, valor pagado, fecha limite, botones) y no tiene scroll interno, por lo que se corta en pantallas normales.

### Solucion

**Archivo:** `src/pages/creadores/personalizados/NewRequestModal.tsx`

Aplicar el patron estandar del proyecto para modales con contenido largo:

1. Agregar `!flex !flex-col gap-0 max-h-[85vh]` al `DialogContent` para forzar layout flex y limitar la altura maxima.
2. Envolver el contenido del formulario (entre el header y los botones) en un `div` con `flex-1 min-h-0 overflow-y-auto` para que sea desplazable.
3. Mover los botones de accion fuera del contenedor scrollable, como un footer fijo con `shrink-0` y un borde superior sutil.

### Resultado

- El header y los botones siempre visibles
- El contenido del formulario hace scroll cuando excede el espacio disponible
- Consistente con el patron de modales del proyecto

