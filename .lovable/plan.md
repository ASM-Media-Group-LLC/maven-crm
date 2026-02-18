

## Revision completa de SharedAgendaPage: Tabs de invitados funcionales

### Problema

Los badges "Pendientes (X)" y "Confirmados (X)" en cada tarjeta de evento son elementos estaticos que solo muestran conteos. No funcionan como tabs interactivos para filtrar la lista de invitados.

### Solucion

Convertir esos badges en tabs funcionales dentro de cada `EventDetailCard`, permitiendo filtrar invitados por estado: Todos, Pendientes y Confirmados.

### Cambios en `src/pages/eventos/SharedAgendaPage.tsx`

#### 1. Convertir EventDetailCard de componente funcional simple a componente con estado

Agregar un estado local `guestFilter` con valores `"all" | "pending" | "confirmed"` para controlar que invitados se muestran.

#### 2. Reemplazar badges estaticos por tabs interactivos

En la seccion de invitados (lineas 426-448), reemplazar los badges "Pendientes" y "Confirmados" por botones estilizados como tabs siguiendo el patron del design system:

- **Todos** (cuenta total) - tab por defecto
- **Pendientes** (cuenta de pending) - con indicador ambar
- **Confirmados** (cuenta de confirmed) - con indicador verde

Los tabs usaran el patron `inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1` con botones `ghost`/`secondary`.

#### 3. Filtrar la lista de invitados segun el tab activo

La grilla de `GuestChip` mostrara solo los invitados correspondientes al filtro seleccionado.

---

### Seccion tecnica

**Archivo:** `src/pages/eventos/SharedAgendaPage.tsx`

**EventDetailCard** (lineas 373-455): Agregar estado interno y reemplazar la seccion de guests:

```tsx
const EventDetailCard = ({ event }: { event: AgendaEvent }) => {
  const [guestFilter, setGuestFilter] = useState<"all" | "pending" | "confirmed">("all");
  const colors = PROJECT_COLORS[event.project_type ?? ""];
  const pendingGuests = event.guests.filter((g) => g.status === "pending");
  const confirmedGuests = event.guests.filter((g) => g.status === "confirmed");
  const displayedGuests = guestFilter === "all" 
    ? event.guests 
    : guestFilter === "pending" 
    ? pendingGuests 
    : confirmedGuests;
  // ...resto del card igual...
  // Seccion de guests: reemplazar badges por tabs
```

**Tabs de invitados** (reemplaza lineas 427-442):
```tsx
<div className="flex items-center justify-between flex-wrap gap-2">
  <div className="flex items-center gap-2">
    <Users className="h-4 w-4 text-muted-foreground" />
    <span className="text-xs font-medium text-muted-foreground">Invitados</span>
  </div>
  <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5">
    <button onClick={() => setGuestFilter("all")} className={tab activo/inactivo}>
      Todos ({event.guests.length})
    </button>
    <button onClick={() => setGuestFilter("pending")} className={...}>
      Pendientes ({pendingGuests.length})
    </button>
    <button onClick={() => setGuestFilter("confirmed")} className={...}>
      Confirmados ({confirmedGuests.length})
    </button>
  </div>
</div>
```

**Grilla filtrada** (linea 444-448): Cambiar `event.guests.map` por `displayedGuests.map`, con mensaje vacio si no hay resultados.

