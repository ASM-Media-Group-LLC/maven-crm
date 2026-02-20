

## Renombrar servicios en el paso 4 del Onboarding

### Cambio

**Archivo:** `src/pages/creadores/onboarding/steps/Step4WorkConfig.tsx` (lineas 14 y 16)

Dos cambios de texto en el array `SERVICES`:

| Linea | Antes | Despues |
|---|---|---|
| 14 | `{ key: "cat_4", label: "Categoría 4" }` | `{ key: "cat_4", label: "Backdoor" }` |
| 16 | `{ key: "valoracion_medios", label: "Valoración de Medios" }` | `{ key: "valoracion_medios", label: "D-Rating" }` |

Las keys se mantienen iguales para no romper datos ya guardados en la columna `precios_contenido` de la base de datos. Solo cambia el texto visible en la UI.

