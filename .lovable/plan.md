

## Plan: Corregir modales de tareas — scroll interno, datepicker auto-cierre y input de hora

### Problemas identificados

1. **Sin scroll interno**: `DialogContent` usa `space-y-4` en el form pero no tiene contenedor scrollable. En pantallas pequeñas o con muchos campos, el contenido se desborda sin scroll.

2. **DatePicker no se cierra al seleccionar fecha**: Los `Popover` de calendario no tienen estado controlado — al seleccionar un día, el popover permanece abierto porque no hay `open/onOpenChange` controlados que cierren tras la selección.

3. **Input de hora nativo (`<input type="time">`)**: No coincide con el design system. Debe reemplazarse con un Select de hora (dropdown con opciones cada 30 min) usando el componente `Select` de Shadcn.

---

### Correcciones

#### 1. Scroll interno en DialogContent

Aplicar el patrón documentado en memoria (`form-layout-sticky`):

- `DialogContent`: agregar `!flex !flex-col gap-0 max-h-[85vh]`
- `DialogHeader`: mantener como `shrink-0`
- Form body: envolver en `<div className="flex-1 min-h-0 overflow-y-auto space-y-4 px-1">`
- Footer (botones): mover fuera del div scrollable como `shrink-0 pt-4`

Aplicar en: `CreateTaskModal`, `EditTaskModal`

#### 2. DatePicker auto-cierre al seleccionar

Convertir cada `Popover` de calendario a estado controlado:

```tsx
const [startCalOpen, setStartCalOpen] = useState(false);

<Popover open={startCalOpen} onOpenChange={setStartCalOpen}>
  ...
  <Calendar
    onSelect={(date) => {
      setStartDate(date);
      setStartCalOpen(false); // cierra al seleccionar
    }}
  />
</Popover>
```

Aplicar en todos los calendarios de: `CreateTaskModal` (2 calendarios), `EditTaskModal` (2 calendarios), `SubtasksPanel` (2 calendarios).

#### 3. Reemplazar `<input type="time">` con Select de hora

Crear un selector de hora con `Select` de Shadcn, con opciones cada 30 minutos (00:00, 00:30, 01:00, ..., 23:30):

```tsx
<Select value={startTime} onValueChange={setStartTime}>
  <SelectTrigger className="w-28">
    <SelectValue placeholder="Hora" />
  </SelectTrigger>
  <SelectContent>
    {timeOptions.map(t => (
      <SelectItem key={t} value={t}>{t}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

Constante `timeOptions` generada: `["00:00", "00:30", "01:00", ...]` (48 opciones).

Aplicar en: `CreateTaskModal` (2 inputs time), `EditTaskModal` (2 inputs time).

---

### Archivos a modificar

| Archivo | Cambios |
|---------|---------|
| `src/pages/tareas/CreateTaskModal.tsx` | Scroll interno, 2 calendarios controlados con auto-cierre, 2 inputs time → Select hora |
| `src/pages/tareas/EditTaskModal.tsx` | Scroll interno, 2 calendarios controlados con auto-cierre, 2 inputs time → Select hora |
| `src/pages/tareas/SubtasksPanel.tsx` | 2 calendarios controlados con auto-cierre (no tiene inputs time ni modal, solo popover fix) |

