

## Calendario con Popover en el boton de fecha de Promolog

### Cambio

**Archivo**: `src/pages/promolog/PromologContent.tsx`

Convertir el boton de fecha estatico en un Popover que muestra un calendario interactivo al hacer clic, replicando el diseno de la imagen:

1. **Agregar estado**: `useState` para la fecha seleccionada y control del popover
2. **Reemplazar el Button** por un `Popover` + `PopoverTrigger` + `PopoverContent` que contiene:
   - Un componente `Calendar` (react-day-picker) configurado en espanol (dias: lu, ma, mi, ju, vi, sa, do; meses en espanol)
   - La fecha de hoy resaltada con fondo `bg-primary` (azul)
   - Semana comenzando en lunes (`weekStartsOn: 1`)
3. **Botones rapidos debajo del calendario**: "Hoy" y "7 dias" separados por un `Separator`, dentro del popover
   - "Hoy" selecciona la fecha actual
   - "7 dias" selecciona la fecha de hace 7 dias (o navega al rango de 7 dias)
4. **Formato de fecha**: El boton muestra la fecha seleccionada en formato "13 de febrero, 2026" usando `toLocaleDateString("es-ES")`
5. **Estilo del boton**: Cambiar de `variant="outline"` a estilo primario (fondo `bg-primary text-primary-foreground`) para coincidir con la imagen

### Imports a agregar
- `useState` de React
- `Popover, PopoverTrigger, PopoverContent` de `@/components/ui/popover`
- `Calendar` de `@/components/ui/calendar`
- `Separator` de `@/components/ui/separator`
- Locale `es` de `date-fns/locale`

### Estructura del Popover
```
PopoverTrigger (boton primario con fecha)
PopoverContent
  Calendar (modo single, locale es, weekStartsOn 1)
  Separator
  Dos botones: "Hoy" | "7 dias"
```

### Detalles tecnicos
- Se reutilizan los componentes existentes del design system: `Popover`, `Calendar`, `Separator`, `Button`
- El calendario usa `react-day-picker` (ya instalado) con locale espanol de `date-fns` (ya instalado)
- Al seleccionar una fecha, el popover se cierra y el texto del boton se actualiza
- Los botones "Hoy" y "7 dias" aparecen en la parte inferior del popover, separados por una linea horizontal

