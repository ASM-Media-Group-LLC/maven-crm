
# Reducir ancho del buscador para que todos los filtros queden en una sola linea

## Cambio
En `src/pages/creadores/CreadoresFilters.tsx`, linea 35, cambiar la clase del contenedor del buscador de `w-full max-w-xs` a `w-48` (192px). Esto reduce el ancho del input de busqueda para que quepa junto a los 5 selectores y el toggle de vista en una sola fila sin wrap.

Tambien cambiar `flex-wrap` a `flex` sin wrap en el contenedor padre (linea 34) para forzar una sola linea.

### Detalle tecnico
- Linea 34: `flex flex-wrap items-center gap-3` -> `flex items-center gap-3`
- Linea 35: `relative w-full max-w-xs` -> `relative w-48`

Esto deja: `[Buscar (w-48)] [Estados] [Categorias] [Paises] [Ciudades] [Managers] [T|G]` todo en una fila.
