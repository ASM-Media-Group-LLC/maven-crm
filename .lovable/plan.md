

## Diagnóstico: Los cambios ya existen en el código

Revisé ambos archivos y las rutas:

- **`EventoSharePage.tsx`** (320 líneas) — ya tiene el rediseño completo: hero con badge de proyecto, grid 2x2 (fecha, horario, ubicación, invitados), notas del evento, lista de invitados con avatares, botones de Google Calendar y .ics. Sin RSVP.
- **`SharedAgendaPage.tsx`** (430 líneas) — ya tiene el layout de 2 columnas: calendario compacto + filtros de proyecto a la izquierda, feed de eventos agrupados por día a la derecha, con DayHeader y CompactEventCard.
- Las rutas están correctas: `/eventos/share/:token` y `/shared/agenda/:token`
- Los links se generan usando `getPublicBaseUrl()` → `https://maven.asmtech.ai`

### El problema probable

Los enlaces públicos apuntan a `https://maven.asmtech.ai` (dominio publicado). Si no has **republicado** el proyecto después de los cambios, el sitio publicado sigue sirviendo la versión anterior.

### Solución

1. **Republicar el proyecto** desde Lovable para que `maven.asmtech.ai` refleje los cambios actuales del código
2. Después de republicar, verificar los links de compartir agenda y evento individual

No se necesitan cambios de código — solo republicar.

