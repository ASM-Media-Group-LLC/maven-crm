

## Ajustar visual de /promolog segun la imagen de referencia

La imagen muestra un estilo de KPI cards y header con diferencias clave respecto a la implementacion actual. A continuacion los cambios necesarios:

### 1. Header: Reorganizar botones en una sola fila con el date picker

Actualmente los botones "Agregar Campana" y "Agregar Entrada" estan en el header, y el date picker esta en la barra de filtros. La imagen muestra todo en una fila debajo del titulo:

```text
[Date Picker]  [Ver Agentes]  [Ver Campanas]  [Agregar Campana]  [+ Agregar Entrada (azul)]
```

Cambios:
- Mover el date picker desde la barra de filtros al header
- Agregar botones "Ver Agentes" y "Ver Campanas" (outline) que cambian la tab activa
- "Agregar Entrada" pasa a ser el boton primario (azul, no outline) con icono +
- "Agregar Campana" se mantiene como outline

### 2. KPI Cards: Borde completo de color con fondo oscuro

La imagen muestra cards con borde completo de color (no solo border-top), iconos grandes con fondo circular de color, y fondo mas oscuro que el estandar:

| Card | Borde | Icono | Color valor |
|------|-------|-------|-------------|
| Total Modelos | accent (purple) | Users con bg accent/20 | success (verde) |
| Tickets ingresados | primary (blue) | CheckCircle con bg primary/20 | primary (azul) |
| NO Chequeadas | destructive (red) | AlertTriangle con bg destructive/20 | destructive (rojo) |
| Completadas Hoy | success (green) | TrendingUp con bg success/20 | success (verde) |

Cambios en cada card:
- Reemplazar `border-t-[3px] border-t-[color]` por `border border-[color]/40` (borde completo sutil)
- Agregar `bg-card/80` o `bg-muted/30` para fondo ligeramente mas oscuro
- Iconos: cambiar de `h-4 w-4 text-muted-foreground` a iconos en un contenedor circular `h-10 w-10 rounded-full bg-[color]/20` con el icono en `h-5 w-5 text-[color]`
- Agregar hover con escala: `transition-all duration-200 hover:scale-[1.03]`

### 3. Eliminar la tab bar separada

La imagen muestra que los botones de navegacion (Ver Agentes, Ver Campanas) estan integrados en el header, no como tabs separadas. Se elimina la barra de tabs y se integran como botones outline en el header.

### Archivo a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/promolog/PromologContent.tsx` | Reorganizar header con botones + date picker en una fila; redisenar KPI cards con borde completo de color, iconos circulares grandes y hover animado; integrar navegacion de tabs en el header |

