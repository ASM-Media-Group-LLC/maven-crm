

## Restaurar tarjetas KPI de metricas en Promolog

### Problema
Las 4 tarjetas KPI que estaban arriba fueron eliminadas en el ultimo cambio. Segun la imagen de referencia, deben estar presentes entre la barra de acciones y el contenido condicional.

### Cambios en `src/pages/promolog/PromologContent.tsx`

**Agregar imports adicionales:**
- `AlertTriangle, TrendingUp, CheckCircle` de lucide-react

**Agregar array de datos mock para las KPI cards (antes del componente):**

| Tarjeta | Valor | Color borde superior | Color valor | Icono | Subtitulo |
|---|---|---|---|---|---|
| Total Modelos | 142 | purple/magenta | green | Users | Registradas en sistema - Filtrando |
| Tickets ingresados | 6 | blue | blue | CheckCircle | Tickets ingresados hoy |
| NO Chequeadas | 128 | red | red | AlertTriangle | Equipo no las reviso |
| Completadas Hoy | 6 | green | foreground | TrendingUp | Tickets ingresados hoy |

**Insertar seccion de KPI cards entre la Action Bar (linea 247) y el contenido condicional (linea 249):**
- Grid de 4 columnas (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`)
- Cada card con borde superior de 3px del color correspondiente (usando `border-t-[3px]`)
- Layout interno: titulo arriba a la izquierda, icono arriba a la derecha, valor grande abajo a la izquierda, subtitulo debajo
- Esta seccion es visible en ambas vistas (dashboard y agentes)

### Estructura visual de cada card
```text
+--[border-top color]--+
| Total Modelos   [ic] |
| 142                  |
| Registradas...       |
+-----------------------+
```
