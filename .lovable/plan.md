

## Rediseno del DateInput + Documentacion en Design System

### Problema actual

El `DateInput` actual es un layout de dos piezas separadas: un `Input` de texto y un `Button` con icono de calendario al lado. Esto se ve desconectado y no coincide con el estilo del `DateRangePicker`, que usa un solo boton-trigger elegante con el icono integrado y abre un popover completo.

### Solucion: DateInput unificado estilo Material Design

Redisenar el `DateInput` para que sea un **trigger unico** (como el DateRangePicker) que al hacer clic abre un popover con:

1. **Calendario con dropdowns de mes/ano** para navegar facilmente (captionLayout dropdown-buttons)
2. **Input manual** debajo del calendario para escribir la fecha en formato dd/mm/aaaa
3. **Footer con botones** Cancelar / Aplicar (mismo patron que el DateRangePicker)

El trigger mostrara la fecha formateada (ej: "15 feb 2024") o el placeholder "Seleccionar fecha" con el icono de calendario a la izquierda, exactamente como el DateRangePicker muestra su rango.

### Estructura visual del nuevo componente

```text
Trigger (cerrado):
[ icono-calendario  15 feb 2024 ]

Popover (abierto):
+----------------------------------+
|  < febrero 2024 [v mes] [v ano] >|
|  Lu Ma Mi Ju Vi Sa Do            |
|  ...calendario...                |
|                                  |
|  [ dd/mm/aaaa ]                  |
|  ─────────────────────────────   |
|              Cancelar  [Aplicar] |
+----------------------------------+
```

### Cambios

#### 1. `src/components/ui/date-input.tsx` — Reescribir

- Trigger: `Button variant="outline"` con `CalendarIcon` + fecha formateada (o placeholder)
- Popover con `DayPicker` usando `captionLayout="dropdown-buttons"`, `fromYear`, `toYear`
- Input manual debajo del calendario con auto-formateo dd/mm/aaaa
- Footer con Cancelar y Aplicar
- Locale `es` para los nombres de meses
- El estado interno (fecha seleccionada) solo se aplica al hacer clic en "Aplicar", como el DateRangePicker
- `pointer-events-auto` en el DayPicker
- Mismos classNames del calendario que usa el DateRangePicker para consistencia visual

#### 2. `src/pages/design-system/sections/InputsSection.tsx` — Agregar documentacion

Agregar una seccion "Date Input" debajo de "Date Range Picker" con:
- Ejemplo interactivo del DateInput
- Tabla de props documentada (value, onChange, placeholder, fromYear, toYear, disabled)
- Notas de uso: cuando usar DateInput vs DateRangePicker

### Props (sin cambios en la interfaz publica)

```text
- value: string (yyyy-MM-dd)
- onChange: (value: string) => void
- placeholder?: string (default: "Seleccionar fecha")
- disabled?: boolean
- className?: string
- fromYear?: number (default: 1940)
- toYear?: number (default: ano actual + 5)
```

La interfaz publica se mantiene identica, asi que todos los formularios que ya usan `DateInput` funcionaran sin cambios.

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/components/ui/date-input.tsx` | Reescribir: trigger unificado tipo boton + popover con calendario (dropdown mes/ano), input manual y footer Cancelar/Aplicar |
| `src/pages/design-system/sections/InputsSection.tsx` | Agregar seccion "Date Input" con ejemplo interactivo y documentacion de props |

