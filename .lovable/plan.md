

# Plan: Corregir filtro Top 20% / Bottom 80% en vista Lista del Pareto Dialog

## Problema
En el diálogo de Análisis 80/20 de Dashboard2, el toggle "Top 20% / Bottom 80%" (`paretoGroup`) solo afecta la vista **Gráfico** (cambia los datos del pie chart via `pieData`). En la vista **Lista**, siempre se muestran ambas secciones (Top y Resto) sin importar qué grupo esté seleccionado.

## Solución
Aplicar el filtro `paretoGroup` también a la vista Lista:

### Cambios en `Dashboard2.tsx` (líneas 1166-1222)

- **Cuando `paretoGroup === "80"`**: Mostrar solo la sección Top (🔥 Top N) con barras de progreso relativas al segmento top
- **Cuando `paretoGroup === "20"`**: Mostrar solo la sección Bottom/Resto (📉 Resto) con barras de progreso relativas al segmento rest
- Mantener el mismo formato visual de cada sección, solo condicionar cuál se muestra según el grupo seleccionado

## Archivo modificado
| Archivo | Cambio |
|---------|--------|
| `Dashboard2.tsx` | Condicionar vista Lista según `paretoGroup` para mostrar solo el segmento seleccionado |

