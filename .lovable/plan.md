

## Hacer que los filtros funcionen realmente y agregar boton "Limpiar filtros"

### Problema actual
- El filtro de **Creador/a** (`selectedCreatorFilter`) no se aplica en la logica de filtrado de entries (linea 261-272).
- El filtro de **Red Social** y **Estado** ya funcionan correctamente.
- No existe un boton para limpiar/resetear todos los filtros a la vez.

### Cambios en `src/pages/promolog/PromologContent.tsx`

**1. Conectar el filtro de Creador/a a la logica de filtrado (lineas 261-272)**

Agregar una condicion que compare el `selectedCreatorFilter` (que es un `creator.id`) contra el nombre del entry. Como los datos actuales son mock y no tienen `creator_id`, se comparara contra el campo `name` del entry usando el nombre del creator seleccionado.

**2. Agregar boton "Limpiar filtros" en la seccion de filtros (linea 487)**

Despues de la grilla de 3 selectores, agregar una fila con un boton `variant="ghost"` alineado a la derecha que resetee los tres filtros (`selectedCreatorFilter`, `selectedNetwork`, `selectedStatus`) a cadena vacia. El boton solo se muestra si al menos un filtro esta activo.

### Estructura visual resultante

```text
[Filtros (colapsable)]
  Creador/a: [Select]    Red Social: [Select]    Estado: [Select]
                                                  [Limpiar filtros]  <-- nuevo
```

### Archivo a modificar
- `src/pages/promolog/PromologContent.tsx`
