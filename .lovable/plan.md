

## Plan: Estandarizar columna "Creación", corregir badge Promolog y rediseñar layout

### 1. Estandarizar nombre de columna de fecha

Todas las tablas deben usar **"Creación"** como nombre de columna (estándar del Design System). Tablas que actualmente dicen "Fecha" y deben cambiar:

- `src/pages/leadgen/LeadGenTable.tsx` — línea 244: "Fecha" → "Creación"
- `src/pages/promolog/PromologTable.tsx` — línea 126: "Fecha" → "Creación"
- `src/pages/contactos/AgenciasTable.tsx` — línea 55: "Fecha" → "Creación"
- `src/pages/tickets/TicketsList.tsx` — línea 130: "Fecha" → "Creación"
- `src/pages/eventos/EventosTable.tsx` — línea 108: ya tiene sentido como "Fecha" (es fecha del evento, no de creación) — se deja

### 2. Corregir badge de Promolog en sidebar

Actualmente `useSidebarBadges.ts` cuenta **todas** las entradas sin `reviewed_by` (25,624). El badge debe mostrar solo las del **día actual** o no mostrarse. Cambiar la query para filtrar por `date >= hoy`.

**Archivo**: `src/hooks/useSidebarBadges.ts`

### 3. Rediseñar layout de PromologContent

El layout actual mezcla todo en un scroll largo. Se debe reorganizar para que sea consistente con Closers/LeadGen:

```text
┌─ Header (título + botones) ─────────────── shrink-0 ─┐
├─ KPI cards compactos ───────────────────── shrink-0 ─┤
├─ Tabs (Promos | Agentes | Campañas) ──── shrink-0 ─┤
├─ Filtros + búsqueda ───────────────────── shrink-0 ─┤
├─ Tabla con scroll interno ──────────── flex-1 ─────┤
└──────────────────────────────────────────────────────┘
```

Cambios en `src/pages/promolog/PromologContent.tsx`:
- Mover KPI cards y tabs al área `shrink-0` (fuera del scroll)
- Eliminar las cards de "Red Social" y "Plataforma" del área fija — moverlas como filtros o integrarlas en los KPIs
- La tabla de promos ocupa el espacio restante con scroll interno (flex-1 min-h-0)
- Filtros (búsqueda, estado, red social, fecha) en fila compacta similar a Closers
- Eliminar la sección redundante de cards de redes/plataformas y usar los filtros select existentes

### Archivos a modificar
- `src/pages/leadgen/LeadGenTable.tsx` — columna "Fecha" → "Creación"
- `src/pages/promolog/PromologTable.tsx` — columna "Fecha" → "Creación"
- `src/pages/contactos/AgenciasTable.tsx` — columna "Fecha" → "Creación"
- `src/pages/tickets/TicketsList.tsx` — columna "Fecha" → "Creación"
- `src/hooks/useSidebarBadges.ts` — filtrar promolog badge por fecha actual
- `src/pages/promolog/PromologContent.tsx` — rediseñar layout (KPIs + tabs sticky, tabla con scroll interno, eliminar cards de redes/plataformas redundantes)

