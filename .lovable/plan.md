
Corregiré `src/pages/finanzas/facturacion/CrearInvoiceModal.tsx` para que al hacer zoom solo crezca el contenido interno scrolleable del preview, nunca la altura visual de la columna derecha.

Plan:
1. Blindar la altura de la columna derecha
- Mantener la columna como `h-full min-h-0 overflow-hidden`
- Asegurar que el bloque `viewerRef` también use `flex-1 min-h-0 overflow-hidden`
- Evitar que cualquier hijo pueda expandir la altura del grid por contenido interno

2. Separar estrictamente header y viewport del preview
- Dejar la barra “Vista previa” como `shrink-0`
- Convertir el área inferior en un viewport fijo: `flex-1 min-h-0 overflow-auto`
- Así, cuando suba el zoom, solo aparece scroll interno dentro del viewport

3. Corregir el contenedor escalado que hoy empuja el layout
- Revisar el wrapper que usa `style={{ height: A4_H * zoom + 32 }}` porque esa altura variable puede estar forzando crecimiento visual del bloque derecho
- Reemplazarlo por una estructura donde el tamaño variable viva solo dentro del área scrolleable, sin afectar la caja externa del preview
- Mantener el documento centrado horizontalmente

4. Ajustar el cálculo de “fit” sin alterar la altura de la columna
- Seguir calculando el zoom con el espacio real disponible del body
- El botón “Ajustar” volverá al encaje automático
- El zoom manual `+/-` no modificará la altura del panel, solo el tamaño del contenido interno

5. Resultado esperado
- la columna derecha queda siempre completa entre header y footer del modal
- al aumentar zoom, no se corta por el footer
- el contenido del preview crece dentro de su propio scroll interno
- el footer permanece visible y fijo
