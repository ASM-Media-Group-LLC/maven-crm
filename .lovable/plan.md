

## Ajustes al DateRangePicker

### Problemas detectados (visible en screenshot)

1. **Overflow horizontal**: El popover con sidebar de presets + 2 meses de calendario es demasiado ancho y se corta en el borde derecho de la pantalla
2. **Botones Aplicar/Cancelar no visibles**: El footer queda fuera del area visible
3. **Sin scroll ni ajuste responsive**: No hay mecanismo para manejar viewports mas reducidos

### Solucion

| Archivo | Cambios |
|---------|---------|
| `src/components/ui/date-range-picker.tsx` | Ajustes de layout, overflow y responsive |

### Cambios especificos

1. **PopoverContent**: Agregar `sideOffset={4}` y cambiar `align="start"` a `align="center"` para mejor posicionamiento. Agregar clases de max-height y overflow-auto para que el contenido sea scrollable si no cabe.

2. **Layout responsive**: Cambiar el layout interno de `flex` horizontal a un esquema que maneje overflow:
   - Agregar `max-h-[calc(100vh-100px)] overflow-auto` al contenedor principal dentro del popover
   - Agregar `max-w-[calc(100vw-32px)]` para evitar que se salga de la pantalla

3. **Calendario responsive**: En pantallas donde no caben 2 meses lado a lado con la sidebar de presets, reducir a 1 mes o hacer la sidebar colapsable. Usar `numberOfMonths={1}` en mobile y `numberOfMonths={2}` en desktop via el hook `use-mobile`.

4. **Footer siempre visible**: Usar `sticky bottom-0 bg-popover` en el footer para que los botones Aplicar/Cancelar siempre sean accesibles.

5. **Inputs de fecha**: Centrar los inputs de fecha manualmente entre ambos calendarios usando `justify-center`.

### Detalles tecnicos

- Importar `useIsMobile` de `@/hooks/use-mobile` para determinar `numberOfMonths`
- El PopoverContent usara `className="w-auto p-0 max-w-[calc(100vw-32px)]"` y `collisionPadding={16}` para que Radix Popover respete los bordes del viewport
- El contenedor flex interno tendra `overflow-auto max-h-[80vh]`
- El footer usara `sticky bottom-0 bg-popover z-10 border-t` para mantenerse siempre visible

