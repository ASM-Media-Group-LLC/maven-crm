

# Funcionalidades de Eventos: Ver Detalles, Editar, Compartir, Eliminar y Cerrar

## Descripcion

Implementar cinco funcionalidades completas para los eventos, accesibles desde el menu de acciones (tres puntos) en la tabla y grid de eventos:

1. **Ver detalles**: Modal con toda la informacion del evento, resumen de invitados por estado, y gestion de invitados con tabs de filtro
2. **Editar evento**: Modal con formulario pre-poblado para modificar los campos del evento
3. **Compartir evento**: Copiar al portapapeles un resumen del evento en texto plano
4. **Eliminar evento**: Confirmacion con alert dialog antes de eliminar
5. **Cerrar evento**: Modal para finalizar un evento como "completado" o "cancelado" con notas de cierre opcionales

---

## Cambios por archivo

### 1. Nuevo: `src/pages/eventos/ViewEventoModal.tsx`

Modal de ver detalles basado en la imagen de referencia:

- **Header**: Nombre del evento como titulo, con botones "Compartir" y "Editar" a la derecha (con pr-8 para no tapar la X de cierre)
- **Badges**: Tipo de evento y status debajo del titulo
- **Card de info**: Fecha (relativa con formatDistanceToNow) y Ubicacion con iconos CalendarDays y MapPin
- **Descripcion/notas**: Texto con las notas del evento
- **Resumen de invitados**: Barra con contadores: Total, Confirmados, Pendientes, Rechazados, Reagendados, Canceladas, Sin Respuesta (colores del sistema)
- **Seccion Invitados**: Titulo "Invitados" con subtitulo "Gestiona el estado y horarios de llegada" y boton "+ Agregar Invitados"
- **Tabs de filtro de invitados**: Todos (N), Pendientes (N), Confirmados (N), Sin respuesta (N), Rechazados (N) usando el patron inline-flex bg-muted/50
- **Lista de invitados**: Mostrar los invitados del evento desde `event_guests` con join a `creators` para obtener nombre. Empty state con icono Users y "No hay invitados con este estado"
- **Acciones en invitados**: Posibilidad de cambiar el status de cada invitado (pending, confirmed, rejected)
- Props: `open`, `onOpenChange`, `event: EventRow`
- Fetch de invitados con `useQuery(["event-guests", eventId])` que hace select de `event_guests` con join a `creators(name, artistic_name, profile_photo_url)`

### 2. Nuevo: `src/pages/eventos/EditEventoModal.tsx`

Modal de edicion:

- Formulario pre-poblado con los datos actuales del evento
- Campos: Nombre, Tipo (select), Fecha inicio, Fecha fin, Hora inicio, Hora fin, Ubicacion (con el mismo Combobox de ubicaciones del formulario de creacion), Capacidad maxima, Notas/Descripcion
- Botones: "Cancelar" y "Guardar cambios"
- Usa `useUpdateEvento()` ya existente
- Toast de exito al guardar

### 3. Nuevo: `src/pages/eventos/CloseEventoModal.tsx`

Modal de cierre basado en la imagen de referencia:

- Titulo: "Cerrar Evento"
- Subtitulo: 'Como finalizo "Nombre del evento"?'
- **RadioGroup** con dos opciones:
  - "Se realizo exitosamente" con icono CheckCircle en verde y descripcion "El evento se llevo a cabo segun lo planeado"
  - "Se cancelo" con icono XCircle en rojo y descripcion "El evento no se realizo y queda cancelado"
- **Textarea**: "Notas de cierre (opcional)" con placeholder "Agrega notas sobre como finalizo el evento..."
- Botones: "Cancelar" y "Confirmar Cierre"
- Al confirmar: actualiza el status del evento a "completed" o "cancelled" y opcionalmente agrega las notas de cierre al campo notes
- Usa `useUpdateEvento()` existente

### 4. Nuevo: `src/pages/eventos/DeleteEventoDialog.tsx`

AlertDialog de confirmacion:

- Titulo: "Eliminar evento"
- Descripcion: 'Estas seguro de que deseas eliminar "Nombre"? Esta accion no se puede deshacer.'
- Botones: "Cancelar" y "Eliminar" (destructive)
- Usa `useDeleteEvento()` existente
- Toast de exito/error

### 5. Editar: `src/pages/eventos/EventosTable.tsx`

- Importar los 4 modales nuevos (ViewEventoModal, EditEventoModal, CloseEventoModal, DeleteEventoDialog)
- Agregar estados para el evento seleccionado y cual modal esta abierto
- Agregar opcion "Cerrar evento" en el DropdownMenu (entre Compartir y Eliminar)
- Conectar cada DropdownMenuItem a su modal correspondiente
- "Compartir" copia al portapapeles: "Evento: {nombre}\nTipo: {tipo}\nFecha: {fecha}\nUbicacion: {ubicacion}\nEstado: {status}" con toast de confirmacion

### 6. Editar: `src/pages/eventos/EventosGrid.tsx`

- Agregar los mismos modales y funcionalidades que en la tabla
- Agregar menu de acciones (tres puntos) en cada card con las mismas opciones: Ver detalles, Editar, Compartir, Cerrar evento, Eliminar
- Al hacer click en la card sin el menu, abrir Ver detalles

### 7. Editar: `src/pages/eventos/useEventos.ts`

- Agregar hook `useEventGuests(eventId)` para fetch de invitados con join a creators
- Agregar hook `useUpdateGuestStatus()` para cambiar el status de un invitado individual
- Agregar hook `useDeleteEventGuest()` para eliminar un invitado del evento

---

## Seccion tecnica

**Estructura del ViewEventoModal (basado en la imagen):**

```text
<DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
  <DialogHeader className="pr-8">
    <div className="flex items-start justify-between">
      <div>
        <DialogTitle>{event.name}</DialogTitle>
        <div className="flex gap-2 mt-1">
          <Badge>{event.event_type}</Badge>
          <Badge>{statusLabel[event.status]}</Badge>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline">Compartir</Button>
        <Button variant="outline">Editar</Button>
      </div>
    </div>
  </DialogHeader>
  <!-- Info card con fecha y ubicacion -->
  <!-- Descripcion -->
  <!-- Resumen counters -->
  <!-- Invitados con tabs -->
</DialogContent>
```

**Estructura del CloseEventoModal:**

```text
<DialogContent className="sm:max-w-md">
  <DialogHeader>
    <DialogTitle>Cerrar Evento</DialogTitle>
    <DialogDescription>Como finalizo "{event.name}"?</DialogDescription>
  </DialogHeader>
  <RadioGroup>
    <label className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer
                      data-[state=checked]:border-primary">
      <RadioGroupItem value="completed" />
      <CheckCircle className="text-green-500" />
      <div>
        <p className="font-medium">Se realizo exitosamente</p>
        <p className="text-sm text-muted-foreground">...</p>
      </div>
    </label>
    <!-- Similar para "cancelled" con XCircle rojo -->
  </RadioGroup>
  <Textarea placeholder="Agrega notas..." />
  <DialogFooter>
    <Button variant="outline">Cancelar</Button>
    <Button>Confirmar Cierre</Button>
  </DialogFooter>
</DialogContent>
```

**Hook useEventGuests:**

```typescript
export function useEventGuests(eventId: string) {
  return useQuery({
    queryKey: ["event-guests", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_guests")
        .select("*, creators(name, artistic_name, profile_photo_url)")
        .eq("event_id", eventId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!eventId,
  });
}
```

**Compartir evento (copia al portapapeles):**

```typescript
const shareText = [
  `Evento: ${e.name}`,
  `Tipo: ${e.event_type}`,
  `Fecha: ${format(new Date(e.date), "d MMM yyyy", { locale: es })}`,
  e.location ? `Ubicacion: ${e.location}` : null,
  `Estado: ${statusLabel[e.status]}`,
].filter(Boolean).join("\n");

navigator.clipboard.writeText(shareText);
toast({ title: "Evento copiado al portapapeles" });
```

