

## Ajustar etiquetas del dropdown de Estado en Filtros

Cambio directo en las etiquetas de texto de los `SelectItem` del selector de Estado dentro de la seccion de filtros colapsables.

### Cambio en `src/pages/promolog/PromologContent.tsx` (lineas 479-483)

Reemplazar las etiquetas actuales por las nuevas:

| Valor interno | Etiqueta actual | Etiqueta nueva |
|---|---|---|
| `__all__` | Todos | Todos |
| `si_promociono` | Si | Promociono |
| `no_promociono` | No | No promociono |
| `parcial` | Parcial | Promocion parcial |
| `pendiente` | Pendiente | Pendiente |

Los valores internos (`value`) no cambian, solo el texto visible para el usuario.

