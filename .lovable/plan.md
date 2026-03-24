

## Plan: Mejorar vistas compartidas de evento y agenda

### Cambios

#### 1. Edge Function `event-external-action` — incluir `instagram_handle` en guests

En la query de guests (línea 55), agregar `instagram_handle` del creator:

```sql
.select("id, guest_name, guest_type, status, creator_id, creators(name, artistic_name, instagram_handle)")
```

Y en el mapping de guestList agregar:
```typescript
instagram_handle: g.creators?.instagram_handle ?? null,
```

Redeployar la edge function.

#### 2. `EventoSharePage.tsx` — modo claro/oscuro + responsivo

- Ya muestra `instagram_handle` como link clickeable (líneas 279-284) — verificar que funcione con los datos del edge function actualizados
- Agregar toggle de tema (Sun/Moon) en el header
- Agregar estado local `theme` que alterna `document.documentElement.classList` entre `dark` y `light`
- Revisar responsividad: el grid 2x2 ya usa `grid-cols-2 md:grid-cols-4`, se ve bien en mobile

#### 3. `SharedAgendaPage.tsx` — más detalle en eventos + buscador + tema

**Más detalle en cada evento card** (`CompactEventCard`):
- Mostrar `description` truncada (1 línea) si existe
- Mostrar lista de invitados con nombre + link clickeable a Instagram (no solo avatares)
- Expandir la card para mostrar: hora, nombre, tipo, proyecto, ubicación, descripción, y lista de invitados con sus @handles como links

**Buscador**:
- Agregar `Input` con icono `Search` en el header, al lado del título
- Estado `searchQuery` que filtra eventos por nombre, ubicación, o nombre de invitado

**Toggle claro/oscuro**:
- Agregar botón Sun/Moon en el header
- Mismo patrón que EventoSharePage: alternar clase `dark`/`light` en `documentElement`

### Archivos a modificar
1. `supabase/functions/event-external-action/index.ts` — agregar `instagram_handle` a la response de guests
2. `src/pages/eventos/EventoSharePage.tsx` — toggle de tema
3. `src/pages/eventos/SharedAgendaPage.tsx` — detalle expandido en cards, buscador, toggle de tema

