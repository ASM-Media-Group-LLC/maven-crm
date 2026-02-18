

## Mejoras en Agenda Compartida: Tabs coloreados, detalle completo y links sociales

### 1. Tabs de proyecto como tags completos con color

Actualmente los tabs de proyecto muestran un pequeno circulo de color junto al nombre. Se cambiaran para que todo el boton/tag tenga el color del proyecto como fondo, no solo un punto.

**Cambio en lineas 201-221**: Cada tab activo tendra fondo completo con el color del proyecto (ej: fondo azul para Ora, purpura para Kash). Los tabs inactivos tendran un estilo sutil con el color del proyecto como borde o texto. Se eliminara el circulo `<span>` de 2x2px y en su lugar el boton completo sera coloreado.

- Tab activo: fondo solido con opacidad (`bg-blue-500/20 text-blue-700`) y borde inferior coloreado
- Tab inactivo: solo texto con color sutil del proyecto

### 2. Mostrar detalle completo de eventos sin necesidad de click

Actualmente los "Proximos Eventos" son cards compactas que requieren click para ver el detalle del dia. Se reemplazara la seccion de cards horizontales compactas por un listado vertical con el detalle completo de cada evento (descripcion, ubicacion, horario, invitados) visible directamente.

**Cambio en lineas 306-318**: Reemplazar el scroll horizontal de `UpcomingEventCard` compactas por un listado vertical usando `EventDetailCard` directamente. El componente `UpcomingEventCard` se eliminara ya que no sera necesario.

- Se mostraran todos los eventos filtrados agrupados por fecha cuando no hay fecha seleccionada
- Cada grupo tendra un header con la fecha
- Se usara `EventDetailCard` para mostrar el detalle completo

### 3. Links clickables a redes sociales de invitados

Actualmente el Instagram handle del invitado se muestra como texto plano. Se convertira en un enlace clickable que abra el perfil de Instagram del invitado en una nueva pestana.

**Cambio en `GuestChip` (lineas 481-502)**: Envolver el handle de Instagram en un tag `<a>` con `href="https://instagram.com/{handle}"`, `target="_blank"` y `rel="noopener noreferrer"`, con hover visual que indique que es clickable.

---

### Seccion tecnica

**Archivo a modificar:** `src/pages/eventos/SharedAgendaPage.tsx`

**Cambio 1 - Tabs coloreados (lineas 201-221):**
- Eliminar el `<span>` circulo de 2x2
- Tab activo: clase completa del color del proyecto como fondo + texto + ring/border
- Tab "Todos" activo: mantener estilo secondary normal
- Tab inactivo con proyecto: texto con color del proyecto sutilmente

**Cambio 2 - Detalle completo sin click (lineas 306-318):**
- Cuando no hay fecha seleccionada, agrupar `filteredEvents` por fecha
- Renderizar cada grupo con un mini-header de fecha y los `EventDetailCard` correspondientes
- Eliminar el componente `UpcomingEventCard` que ya no se usara
- Mantener la seccion de "Selected Day Detail" cuando se selecciona una fecha en el calendario

**Cambio 3 - Instagram clickable (lineas 481-502):**
- Cambiar el `<div>` con Instagram handle a un `<a href="https://instagram.com/{handle}" target="_blank" rel="noopener noreferrer">` 
- Agregar estilos hover: `hover:text-pink-500 transition-colors cursor-pointer`
- Hacer que el link sea visualmente distinguible con underline on hover

