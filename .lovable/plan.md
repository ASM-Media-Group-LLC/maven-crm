

## Reemplazar Date Picker nativo por componente del Design System

### Problema

Los campos de fecha en "Crear Evento" y "Editar Evento" usan `<Input type="date" />`, que renderiza el date picker nativo del navegador. Este no corresponde con el sistema de diseno de la plataforma, que usa el patron Shadcn Calendar + Popover.

### Solucion

Reemplazar los dos campos de fecha (fecha inicio y fecha fin) por el componente `Calendar` de Shadcn dentro de un `Popover`, siguiendo el patron documentado en el Design System.

### Cambios en `src/pages/eventos/NuevoEventoForm.tsx`

1. **Imports**: Agregar `Calendar` de `@/components/ui/calendar`, `format` y `parse` de `date-fns`, y `es` locale de `date-fns/locale/es`.

2. **Estado**: Cambiar el tipo de `date` y `endDate` de `string` a `Date | undefined`. Convertir al formato `YYYY-MM-DD` solo al enviar el formulario.

3. **Campo "Fecha inicio"** (linea 229): Reemplazar `<Input type="date" />` por:
   - Un `Popover` con un `Button` trigger que muestra la fecha formateada o el placeholder "Seleccionar fecha"
   - Un `Calendar` con `mode="single"`, locale en espanol, y `className="pointer-events-auto"`

4. **Campo "Fecha fin"** (linea 234): Mismo patron, condicionado a `multiDay === true`

5. **handleSubmit**: Formatear las fechas `Date` a string `YYYY-MM-DD` con `format(date, "yyyy-MM-dd")` antes de enviar.

---

### Seccion tecnica

**Archivo a modificar:** `src/pages/eventos/NuevoEventoForm.tsx`

**Imports a agregar:**
```
import { Calendar } from "@/components/ui/calendar";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale/es";
```

**Estado actualizado:**
```
const [date, setDate] = useState<Date | undefined>(
  event?.date ? parse(event.date, "yyyy-MM-dd", new Date()) : undefined
);
const [endDate, setEndDate] = useState<Date | undefined>(
  event?.end_date ? parse(event.end_date, "yyyy-MM-dd", new Date()) : undefined
);
```

**Componente de fecha (patron repetido para inicio y fin):**
```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button
      variant="outline"
      className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
    >
      <CalendarDays className="mr-2 h-4 w-4" />
      {date ? format(date, "PPP", { locale: es }) : "Seleccionar fecha"}
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-auto p-0" align="start">
    <Calendar
      mode="single"
      selected={date}
      onSelect={setDate}
      locale={es}
      initialFocus
      className="pointer-events-auto"
    />
  </PopoverContent>
</Popover>
```

**Validacion y submit actualizado:**
- Cambiar `!date` a `!date` (sigue siendo falsy check)
- En formData: `date: format(date, "yyyy-MM-dd")` en lugar de `date` directamente
- Para endDate: `end_date: multiDay && endDate ? format(endDate, "yyyy-MM-dd") : null`

Como `EditEventoPage.tsx` reutiliza `NuevoEventoForm`, ambas vistas se actualizan automaticamente.

