

## Mejoras al Modal de Nueva Campana Mensual

### Cambios propuestos

**1. Selector de Creador/a con buscador interno**

Reemplazar el `Select` actual por un Combobox basado en `Popover` + `Command` (cmdk, ya instalado). El usuario podra escribir para filtrar creadoras por nombre, y seleccionar con un clic. Se mostrara un input con icono de busqueda dentro del dropdown.

**2. Selector de Mes/Ano con estilo del sistema de diseno**

Reemplazar el `<Input type="month">` nativo por un `Popover` con `Calendar` en modo single, configurado para seleccionar solo mes y ano. Se usara un boton estilizado como trigger (mismo patron que el DateRangePicker existente) mostrando el mes/ano seleccionado con formato legible (ej. "Febrero 2026").

---

### Seccion tecnica

**Archivo:** `src/pages/promolog/PromologContent.tsx`

**Imports nuevos:**
- `Popover, PopoverContent, PopoverTrigger` desde `@/components/ui/popover`
- `Command, CommandInput, CommandList, CommandEmpty, CommandItem` desde `@/components/ui/command`
- `CalendarIcon, ChevronsUpDown` desde `lucide-react`
- `format` desde `date-fns`
- `Calendar` desde `@/components/ui/calendar`

**Cambios en estado:**
- `campaignMonth` pasa de `string` a `Date | undefined` para integrarse con Calendar
- Agregar `campaignCreatorOpen: boolean` para controlar el Popover del Combobox
- Agregar `campaignMonthOpen: boolean` para controlar el Popover del calendario
- Agregar `campaignCreatorSearch: string` para el filtro de busqueda interno

**Selector de Creador/a (lineas 1044-1051):**
Reemplazar el `<Select>` por:
```
<Popover open={campaignCreatorOpen} onOpenChange={setCampaignCreatorOpen}>
  <PopoverTrigger asChild>
    <Button variant="outline" role="combobox" className="w-full justify-between">
      {nombre seleccionado || "Seleccionar creador/a"}
      <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-full p-0">
    <Command>
      <CommandInput placeholder="Buscar creador/a..." />
      <CommandList>
        <CommandEmpty>No se encontro.</CommandEmpty>
        {creators.map(c => (
          <CommandItem onSelect={() => { setCampaignCreator(c.id); setCampaignCreatorOpen(false); }}>
            <Check className={cn("mr-2 h-4 w-4", campaignCreator === c.id ? "opacity-100" : "opacity-0")} />
            {c.artistic_name || c.name}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

**Selector de Mes/Ano (lineas 1053-1056):**
Reemplazar el `<Input type="month">` por un Popover con Calendar en modo single, configurado con `captionLayout="dropdown-buttons"` y navegacion por mes:
```
<Popover open={campaignMonthOpen} onOpenChange={setCampaignMonthOpen}>
  <PopoverTrigger asChild>
    <Button variant="outline" className="w-full justify-start text-left font-normal">
      <CalendarIcon className="mr-2 h-4 w-4" />
      {campaignMonth ? format(campaignMonth, "MMMM yyyy") : "Seleccionar mes"}
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-auto p-0">
    <Calendar mode="single" selected={campaignMonth}
      onSelect={(d) => { setCampaignMonth(d); setCampaignMonthOpen(false); }}
      className="p-3 pointer-events-auto" />
  </PopoverContent>
</Popover>
```

**Ajuste en `handleCreateCampaign`:** Actualizar el reset para usar `undefined` en vez de `""` para `campaignMonth`.
