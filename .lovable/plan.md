

## Ajustes del modal "Selecciona una Creadora" segun el sistema de diseno

### Problemas detectados

El modal recien implementado tiene varios colores hardcoded que violan las restricciones del sistema de diseno:

1. **`text-green-500`** en KPIs "Total Creadoras" y "Completadas Hoy" (lineas 697, 709) - debe usar `text-success`
2. **`text-orange-500`** en KPI "Pendientes" (linea 703) - debe usar `text-warning`
3. **`border-amber-600/50`** en el avatar del creador (linea 753) - debe usar un color del sistema como `border-warning` o `border-muted-foreground/50`
4. **`bg-destructive`** en el indicador de estado (linea 749) - este si esta correcto, usa token del sistema

### Detalle tecnico

**Archivo:** `src/pages/promolog/PromologContent.tsx`

| Linea | Actual | Corregido |
|-------|--------|-----------|
| 697 | `text-green-500` | `text-success` |
| 703 | `text-orange-500` | `text-warning` |
| 709 | `text-green-500` | `text-success` |
| 753 | `border-amber-600/50` | `border-muted-foreground/50` |

Ademas, las tarjetas KPI dentro del modal no siguen el patron operacional con borde superior de 3px que se usa en el resto de Promolog. Se agregara `border-t-[3px]` con colores semanticos del sistema a las 3 tarjetas KPI del modal para mantener consistencia visual:

- Total Creadoras: `border-t-success`
- Pendientes: `border-t-warning`
- Completadas Hoy: `border-t-success`

### Nota adicional sobre KPIs principales (lineas 362-404)

Las 4 tarjetas KPI principales de Promolog tambien tienen colores hardcoded en el borde superior (`border-t-purple-500`, `border-t-blue-500`, `border-t-red-500`, `border-t-green-500`) y en los valores (`text-green-500`, `text-blue-500`, `text-red-500`). Estos se corregiran para usar tokens del sistema:

| Linea | Actual | Corregido |
|-------|--------|-----------|
| 364 | `border-t-purple-500` | `border-t-accent` |
| 370 | `text-green-500` | `text-success` |
| 374 | `border-t-blue-500` | `border-t-primary` |
| 380 | `text-blue-500` | `text-primary` |
| 384 | `border-t-red-500` | `border-t-destructive` |
| 390 | `text-red-500` | `text-destructive` |
| 394 | `border-t-green-500` | `border-t-success` |

