
# Mejorar Seccion de Crear Evento

## Descripcion

Tres mejoras principales en la pagina `/eventos/nuevo`:

1. **Header y Footer fijos**: Header con "Volver a Eventos" y titulo fijo en la parte superior, footer con botones "Cancelar" y "Crear Evento" fijo en la parte inferior. El contenido del formulario hace scroll entre ambos.

2. **Input de Ubicacion con buscador**: Reemplazar el input de texto por un Combobox (Popover + Command) que permite escribir libremente o seleccionar ubicaciones anteriores registradas en la tabla `events`.

3. **Modal de Agregar Invitados**: Nuevo componente modal con 3 tabs (Creadoras, Contactos, Externo). Creadoras busca en la tabla `creators` con checkbox multiple. Contactos mostrara un empty state (no existe tabla de contactos aun). Externo permite agregar un invitado manual con nombre, redes sociales y facturacion.

## Cambios por archivo

### 1. Editar: `src/pages/eventos/NuevoEventoForm.tsx`

**Layout con header/footer fijos:**
- Cambiar el `<main>` de `overflow-auto p-6` a `flex flex-col h-full overflow-hidden`
- Header fijo (sticky top): breadcrumb "Volver a Eventos", titulo "Crear Evento", subtitulo "Configura los detalles del evento y agrega invitados", separador
- Contenido central con `flex-1 overflow-auto p-6`
- Footer fijo (sticky bottom): borde superior, botones "Cancelar" (outline, navega a /eventos con toast "Edicion cancelada") y "Crear Evento" (primary)

**Ubicacion con Combobox:**
- Reemplazar el `<Input>` de ubicacion por un Popover + Command (cmdk ya instalado)
- Fetch de ubicaciones unicas desde `events.location` via query `useQuery` con key `["event-locations"]`
- El usuario puede escribir para filtrar las ubicaciones existentes o usar el texto como valor libre
- Mostrar seccion "Ubicaciones anteriores" con icono MapPin, como en la imagen de referencia

**Invitados funcional:**
- Agregar estado local para invitados seleccionados (array de `{ type, id?, name, ... }`)
- Habilitar el boton "Agregar Invitados" para abrir el modal
- Mostrar lista de invitados agregados con opcion de eliminar
- Actualizar el contador en el titulo "Invitados (N)"
- Al guardar evento, insertar los invitados en `event_guests`

### 2. Nuevo: `src/pages/eventos/AddGuestsModal.tsx`

Modal Dialog con:
- Titulo "Agregar Invitados"
- 3 tabs usando inline-flex tabs: "Creadoras", "Contactos", "Externo"

**Tab Creadoras:**
- Input de busqueda "Buscar creadoras..."
- Lista de creators desde `useQuery(["creators"])` con checkbox
- Cada fila: checkbox, avatar (inicial + color), nombre completo, @instagram_handle, badge de status
- Footer: "N creadora(s) seleccionada(s)", botones "Cancelar" y "Confirmar"

**Tab Contactos:**
- Empty state: "No hay contactos registrados" con mensaje explicativo
- (No existe tabla de contactos en el sistema actualmente)

**Tab Externo:**
- Formulario manual: Nombre* (obligatorio), Instagram, TikTok, X/Twitter, YouTube, Facturacion Promedio ($/mes)
- Botones: "Cancelar" y "+ Agregar y Cerrar"

### 3. Editar: `src/pages/eventos/useEventos.ts`

- Agregar hook `useEventLocations()` que hace `SELECT DISTINCT location FROM events WHERE location IS NOT NULL`
- Agregar hook `useAddEventGuests()` para insertar multiples invitados en `event_guests`

## Seccion tecnica

**Estructura del layout fijo:**
```text
<main class="flex flex-col h-full overflow-hidden">
  <header class="sticky top-0 z-10 bg-background p-6 pb-4 border-b">
    <!-- breadcrumb + titulo -->
  </header>
  <div class="flex-1 overflow-auto p-6">
    <!-- grid con formulario e invitados -->
  </div>
  <footer class="sticky bottom-0 z-10 bg-background border-t px-6 py-4 flex justify-end gap-3">
    <Button variant="outline">Cancelar</Button>
    <Button>Crear Evento</Button>
  </footer>
</main>
```

**Combobox de ubicacion (usa cmdk ya instalado):**
- Popover con CommandInput para busqueda
- CommandGroup "Ubicaciones anteriores" con items de ubicaciones existentes
- Si el texto no coincide con ninguna existente, se usa como valor libre
- El valor seleccionado se muestra en el trigger con icono MapPin

**Tipo de invitado local (antes de guardar):**
```typescript
type LocalGuest = {
  type: "creator" | "contact" | "external";
  creator_id?: string;
  guest_name: string;
  instagram?: string;
  tiktok?: string;
  twitter?: string;
  youtube?: string;
  billing?: number;
};
```

**Flujo al guardar evento:**
1. INSERT evento en `events` y obtener el ID retornado
2. INSERT batch de invitados en `event_guests` con el event_id
3. Toast de exito y navegar a `/eventos`

**Cambio necesario en useAddEvento:** Modificar para retornar el ID del evento insertado (usar `.select().single()` en lugar de solo `.insert()`)
