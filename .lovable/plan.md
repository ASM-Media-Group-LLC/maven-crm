

# Reemplazar modal de edición por página completa reutilizando NuevoEventoForm

## Problema

Al hacer click en "Editar" en un evento, se abre un modal compacto (`EditEventoModal`) en lugar de una vista de página completa idéntica a la de creación (`/eventos/nuevo`) pero con los campos pre-llenados.

## Solución

1. Crear una nueva ruta `/eventos/:id/editar` que renderice el mismo formulario de creación pero en modo edición.
2. Refactorizar `NuevoEventoForm` para que acepte un prop opcional `event` con los datos del evento a editar.
3. Cuando `event` está presente, el formulario pre-llena todos los campos, cambia el título a "Editar Evento", carga los invitados existentes y al guardar usa `useUpdateEvento` en lugar de `useAddEvento`.
4. Actualizar el dropdown de acciones en `EventosTable` y `EventosGrid` para que "Editar" navegue a `/eventos/:id/editar` en lugar de abrir el modal.

## Cambios por archivo

### 1. `src/pages/eventos/NuevoEventoForm.tsx`

- Agregar prop opcional `event?: EventRow` e `existingGuests?: EventGuest[]`
- Si `event` está presente:
  - Pre-llenar todos los campos con `useState(event.name)`, etc.
  - Cambiar título de "Crear Evento" a "Editar Evento"
  - Cambiar subtítulo a "Modifica los detalles del evento"
  - Cambiar botón de "Crear Evento" a "Guardar cambios"
  - Calcular `multiDay` basado en si `event.end_date` tiene valor
  - Descomponer `start_time` y `end_time` en hora/minuto separados
  - Cargar los invitados existentes en la lista local
- Si `event` está presente, usar `useUpdateEvento` para guardar; si no, usar `useAddEvento` (comportamiento actual)
- Al guardar en modo edición: actualizar evento + agregar nuevos invitados + no tocar los existentes

### 2. `src/pages/eventos/EditEventoPage.tsx` (nuevo)

- Wrapper que obtiene el `id` de la URL con `useParams`
- Usa `useEventDetail(id)` para cargar los datos del evento
- Usa una query adicional para cargar los invitados existentes
- Pasa `event` y `existingGuests` a `NuevoEventoForm`
- Muestra un loading mientras se cargan los datos

### 3. `src/pages/EditEvento.tsx` (nuevo)

- Wrapper con sidebar/topbar (mismo patrón que `NuevoEvento.tsx`)
- Renderiza `EditEventoPage` dentro del layout estándar

### 4. `src/App.tsx`

- Agregar ruta: `/eventos/:id/editar` que apunte a `EditEvento`
- Colocarla antes de `/eventos/:id` para que no sea capturada por la ruta de detalle

### 5. `src/pages/eventos/EventosTable.tsx`

- Cambiar la acción de "Editar" para navegar a `/eventos/${e.id}/editar` en lugar de abrir `EditEventoModal`
- Eliminar el estado `editOpen` y la referencia al `EditEventoModal`

### 6. `src/pages/eventos/EventosGrid.tsx`

- Mismo cambio que en EventosTable: navegar a la ruta de edición en lugar de abrir modal

### 7. `src/pages/eventos/EventoDetailPage.tsx`

- Si el header tiene un botón de "Editar", cambiar para navegar a `/eventos/:id/editar`

## Sección técnica

### Lógica de pre-llenado en NuevoEventoForm

```text
// Descomponer start_time "HH:MM:SS" en hora y minuto
const [initH, initM] = event?.start_time
  ? [event.start_time.slice(0, 2), event.start_time.slice(3, 5)]
  : ["", "00"];

// multiDay se calcula automáticamente
const initialMultiDay = !!event?.end_date;
```

### Flujo de guardado en modo edición

```text
1. updateEvento.mutateAsync({ id: event.id, data: { ...formFields } })
2. Para invitados nuevos (no existentes): addGuests.mutateAsync(newGuests)
3. toast "Evento actualizado"
4. navigate(`/eventos/${event.id}`)
```

### Ruta en App.tsx

```text
/eventos/:id/editar  ->  EditEvento  (ANTES de /eventos/:id)
/eventos/:id         ->  EventoDetail
```
