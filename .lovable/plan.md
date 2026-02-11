

# Redisenar Calendario, Filtros y Crear Componente DateRangePicker

## Descripcion general

Tres areas de trabajo:

1. **Separar calendario y proximos eventos** en contenedores independientes (dos Cards lado a lado en lugar de una sola Card con grid interno).
2. **Mejorar filtros**: ampliar input de busqueda y reemplazar los dos inputs `type="date"` por un DateRangePicker personalizado.
3. **Crear componente DateRangePicker** reutilizable y documentarlo en el design system.

---

## Cambios por archivo

### 1. Nuevo: `src/components/ui/date-range-picker.tsx`

Componente reutilizable que:
- Usa un `Popover` como contenedor
- Trigger: boton con icono CalendarIcon y texto "Seleccionar fechas" (o el rango formateado si hay seleccion)
- Contenido del popover:
  - Panel izquierdo con presets rapidos: "Hoy", "Ayer", "Esta semana", "Semana pasada", "Este mes", "Mes pasado"
  - Panel derecho con dos calendarios DayPicker lado a lado (mes actual y siguiente) en modo `range`
  - Inputs de fecha manual (dd/mm/yyyy) debajo de los calendarios
  - Botones "Cancelar" y "Aplicar" en el footer
- Props: `from: Date | undefined`, `to: Date | undefined`, `onApply: (from, to) => void`, `placeholder?: string`
- Usa tokens del sistema (bg-popover, border-border, text-foreground, primary para seleccion)
- Incluye `pointer-events-auto` en el Calendar como indica el contexto de shadcn-datepicker

### 2. Editar: `src/pages/eventos/EventosCalendar.tsx`

**Separar en dos contenedores:**
- Layout: `grid grid-cols-1 lg:grid-cols-3 gap-6` (en lugar del grid interno actual)
- **Card izquierda (lg:col-span-2)**: Contiene solo el calendario DayPicker con:
  - Header con "febrero 2026" (titulo del mes en formato largo), boton "Hoy" y flechas de navegacion
  - El DayPicker ocupa todo el ancho de la card
  - Indicadores de eventos (puntos azules debajo de los dias con eventos, en lugar del underline actual)
  - Footer: barra con "N eventos este mes" en un banner con fondo accent
- **Card derecha**: Titulo "Proximos eventos", lista vertical de eventos en cards individuales:
  - Cada evento en su propia card con fondo card y borde
  - Icono del tipo de evento, nombre en bold, tiempo relativo ("hace 3 horas", "en 1 dia"), ubicacion
  - Badge "Proximo" en primary

### 3. Editar: `src/pages/eventos/EventosFilters.tsx`

- **Input de busqueda**: Cambiar `w-48` a `flex-1` para que se extienda al ancho disponible
- **Eliminar** los dos `<Input type="date">` (dateFrom y dateTo)
- **Agregar** el nuevo componente `DateRangePicker` en su lugar
- Mantener los selects de Tipo y Horario sin cambios
- Mantener los botones de vista (tabla/grid) al final con `ml-auto`

### 4. Editar: `src/pages/eventos/useEventos.ts`

- Sin cambios en la logica de filtros (dateFrom y dateTo siguen siendo strings en el formato YYYY-MM-DD)

### 5. Editar: `src/pages/design-system/sections/InputsSection.tsx`

Agregar nueva subseccion **"Date Range Picker"** despues de la seccion de Select:
- Titulo "Date Range Picker"
- Descripcion: componente para seleccion de rangos de fecha con presets rapidos
- Ejemplo interactivo del DateRangePicker
- Caja de documentacion con las props y tokens utilizados

---

## Seccion tecnica

**Estructura del DateRangePicker:**
```text
<Popover>
  <PopoverTrigger>
    <Button variant="outline">
      <CalendarIcon /> "Seleccionar fechas" | "11 feb - 28 feb 2026"
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-auto p-0">
    <div className="flex">
      <!-- Presets sidebar -->
      <div className="border-r p-3 space-y-1">
        <Button variant="outline" size="sm">Hoy</Button>
        <Button variant="ghost" size="sm">Ayer</Button>
        ...
      </div>
      <!-- Calendars -->
      <div className="p-3">
        <DayPicker mode="range" numberOfMonths={2} />
        <div className="flex items-center gap-2 mt-3">
          <Input placeholder="dd/mm/yyyy" />
          <span>--</span>
          <Input placeholder="dd/mm/yyyy" />
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="ghost">Cancelar</Button>
          <Button>Aplicar</Button>
        </div>
      </div>
    </div>
  </PopoverContent>
</Popover>
```

**Estructura del calendario separado:**
```text
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <Card className="lg:col-span-2">
    <!-- Header: titulo mes, Hoy, flechas -->
    <!-- DayPicker full width -->
    <!-- Footer: N eventos este mes -->
  </Card>
  <Card>
    <h3>Proximos eventos</h3>
    <!-- Cards individuales por evento -->
  </Card>
</div>
```

**Indicadores de eventos en el calendario:**
- En lugar de underline, usar modifiers con un pseudo-elemento (dot) debajo del numero del dia
- Implementado via `modifiersClassNames` con una clase CSS custom que agrega un punto azul usando `after:` de Tailwind

**Presets del DateRangePicker:**
- Hoy: from=today, to=today
- Ayer: from=yesterday, to=yesterday
- Esta semana: from=startOfWeek, to=endOfWeek
- Semana pasada: from=startOfWeek-7, to=endOfWeek-7
- Este mes: from=startOfMonth, to=endOfMonth
- Mes pasado: from=startOfLastMonth, to=endOfLastMonth

Todas las funciones de fecha usan `date-fns` que ya esta instalado.

