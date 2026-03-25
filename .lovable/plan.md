
Corregiré el preview para que el área visible quede siempre fija y el crecimiento por zoom ocurra solo dentro del scroll interno, no en el contenedor del modal.

**Problema detectado**
El elemento seleccionado (`line 180`) sigue participando con altura “auto”, así que cuando el wrapper escalado (`line 181`) crece por encima de 50%, ese contenedor intermedio también intenta crecer visualmente y termina dando la sensación de corte/expansión. El zoom debe afectar solo al documento, no al viewport del preview.

**Ajuste propuesto**
1. Mantener la tarjeta de preview con altura fija dentro de la columna derecha:
   - conservar `flex-1 min-h-0` en la tarjeta y en `bodyRef`
   - el footer del modal no se toca

2. Convertir `bodyRef` en el único viewport real del preview:
   - dejar `overflow-auto` solo ahí
   - asegurar que su altura quede totalmente limitada por el padre

3. Cambiar el wrapper interno de `line 180` para que ocupe siempre el alto disponible del viewport, en vez de crecer con el documento:
   - pasar de un contenedor “auto-height” a uno tipo `min-h-full min-w-full`
   - centrar el documento dentro de ese espacio
   - mantener padding interno sin alterar la altura externa

4. Mantener el documento A4 escalado dentro de su wrapper dimensionado:
   - conservar el wrapper con `width: A4_W * zoom` y `height: A4_H * zoom`
   - conservar `transformOrigin: "top left"`
   - así el scroll aparece dentro del viewport cuando el zoom supera el fit, pero el panel no cambia de tamaño

5. Eliminar cualquier clipping intermedio que impida el scroll correcto:
   - revisar el `overflow-hidden` del contenedor de la tarjeta para que no recorte antes de que `bodyRef` pueda scrollear

**Resultado esperado**
- A 40%, 50%, 60% o más, la caja de preview mantiene la misma altura visible
- el documento se sigue centrando
- si el zoom excede el espacio, aparece scroll dentro del preview
- ni el contenido central ni el footer del modal cambian de posición

**Archivo a ajustar**
- `src/pages/finanzas/facturacion/CrearInvoiceModal.tsx`

**Implementación concreta**
- `line 160`: relajar el clipping intermedio si está bloqueando el scroll
- `line 179`: dejar este contenedor como viewport fijo (`flex-1 min-h-0 overflow-auto`)
- `line 180`: cambiarlo a un contenedor que llene el viewport (`min-h-full min-w-full`) y centre el A4 sin crecer con él
- `line 181-183`: conservar el wrapper escalado actual porque ya corrige el tamaño visual del documento
