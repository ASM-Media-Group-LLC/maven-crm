

## Hacer que los titulos de la tabla de Entradas Recientes queden fijos al hacer scroll

### Problema
La tabla esta dentro de un contenedor padre con `overflow-auto` (linea 385 de PromologContent.tsx). Cuando el usuario hace scroll vertical, es ese contenedor exterior el que se desplaza, no el contenedor interno de la tabla. Por eso el `sticky top-0` del TableHeader no funciona: el header se va hacia arriba junto con todo el contenido.

### Solucion
Cambiar la estructura del contenedor de la tabla para que el scroll vertical ocurra **dentro** del contenedor de la tabla, no en el padre. Esto se logra asegurando que el contenedor de la tabla tenga una altura fija que permita el scroll interno.

### Cambios

**Archivo: `src/pages/promolog/PromologTable.tsx`**
- Cambiar `max-h-[calc(100vh-24rem)]` por `max-h-[calc(100vh-20rem)]` para dar mas espacio visible a la tabla y asegurar que el scroll interno se active correctamente.

**Archivo: `src/pages/promolog/PromologContent.tsx`**
- En la seccion de "Entradas Recientes" (linea 585), cambiar la estructura para que la tabla ocupe el espacio restante de la pantalla de forma dinamica.
- Envolver la seccion de entradas en un contenedor flex que ocupe todo el espacio disponible, sacandola del flujo general de `space-y-6`.
- Hacer que el titulo "Entradas Recientes" sea `shrink-0` y la tabla ocupe `flex-1 min-h-0`.
- Quitar el `max-h` fijo del contenedor de la tabla en PromologTable y dejar que el contenedor padre controle la altura con `flex-1 min-h-0 overflow-auto`.

### Resultado esperado
Los titulos de columna (Ticket, Modelo, Red Social, Plataforma, Resultado, Agente, Fecha, Acciones) permaneceran siempre visibles en la parte superior de la tabla mientras el usuario hace scroll por las filas de datos.

