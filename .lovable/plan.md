
Corregiré `src/pages/finanzas/facturacion/CrearInvoiceModal.tsx` para que la columna derecha quede estrictamente contenida entre el header y el footer del modal, sin montarse sobre el footer.

Plan:
1. Convertir la zona central del modal en un contenedor con altura realmente acotada:
   - mantener `DialogContent` como `flex flex-col max-h-[85vh] overflow-hidden`
   - cambiar la zona de contenido a `flex-1 min-h-0 overflow-hidden p-6`

2. Asegurar que el grid interno no crezca por contenido:
   - usar `grid grid-cols-[400px_1fr] gap-6 h-full min-h-0`
   - hacer que ambas columnas tengan `min-h-0 h-full`

3. Encapsular correctamente la columna de preview:
   - columna derecha: `flex flex-col min-h-0 h-full`
   - bloque de preview: `flex-1 min-h-0 h-full overflow-hidden`
   - mantener su header propio como `shrink-0`
   - dejar el área del documento como la única región interna que puede manejar el espacio restante

4. Evitar que el preview empuje el footer:
   - quitar cualquier comportamiento basado en altura automática del contenedor del preview
   - si hace falta, mover el scroll únicamente al viewport interno del documento, nunca al contenedor completo del preview ni al modal

5. Ajustar el wrapper del documento para que no rompa el layout:
   - mantener el A4 escalado con `transform: scale(...)`
   - asegurar que el tamaño del wrapper del documento no haga crecer la columna derecha por fuera de la altura disponible

Resultado esperado:
- header visible arriba
- footer visible abajo
- preview completamente contenido entre ambos
- sin solapamiento con los botones de acción
- la columna derecha ya no invade otras áreas del modal
