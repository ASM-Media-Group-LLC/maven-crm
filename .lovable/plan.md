

## Ocultar Red Social cuando se selecciona "No Promocionó"

### Cambio en `src/pages/promolog/PromologEntryCard.tsx`

Actualmente la seccion de "Red Social" (lineas 241-267) se muestra siempre, independientemente de si se selecciona "Si Promociono" o "No Promociono". Segun la imagen de referencia, cuando se selecciona "No Promociono" solo deben aparecer:

1. Tarjeta del creador (avatar + nombre + handle)
2. Botones "Si Promociono" / "No Promociono"
3. Botones "Cancelar" / "Guardar Cambios"

### Detalle tecnico

**Archivo:** `src/pages/promolog/PromologEntryCard.tsx`

**Cambio:** Mover la seccion de Red Social (lineas 241-267) dentro del bloque condicional `{editResult === "si" && (...)}` que ya existe en la linea 270, para que solo se muestre cuando se selecciona "Si Promociono".

Esto significa que el bloque condicional pasara de contener solo Plataforma, Tipo de Contacto, Notas y Evidencia, a contener tambien la seccion de Red Social como primer elemento.

