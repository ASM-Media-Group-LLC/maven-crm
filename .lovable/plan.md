

## Cambiar etiqueta "Categoría 1" a "Contenido X"

### Cambio

En el archivo `src/pages/creadores/onboarding/steps/Step4WorkConfig.tsx`, actualizar el array `SERVICES` cambiando el label del primer elemento:

- **Antes:** `{ key: "cat_1", label: "Categoría 1" }`
- **Después:** `{ key: "cat_1", label: "Contenido X" }`

Solo se modifica el texto visible (label). La key interna `cat_1` no cambia, por lo que no afecta la base de datos ni el payload.

### Archivo afectado

| Archivo | Cambio |
|---|---|
| `steps/Step4WorkConfig.tsx` | Cambiar label de "Categoría 1" a "Contenido X" en linea 11 |

