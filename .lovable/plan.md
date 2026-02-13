

## Correccion de Acciones en Tablas y Vista Tabla/Grid en Promolog

Dos cambios principales: (1) reemplazar tooltips por DropdownMenu en la tabla de tickets para seguir el patron estandar, y (2) agregar vistas de tabla y grid en Promolog.

---

### 1. Archivo modificado: `src/pages/tickets/TicketsList.tsx`

Reemplazar los 3 botones con Tooltip por un unico **DropdownMenu** con icono `MoreHorizontal`, siguiendo exactamente el patron de EventosTable, ContactosTable y LeadGenTable:

**Antes (actual):**
```text
<Tooltip><TooltipTrigger><Button><Eye /></Button></TooltipTrigger><TooltipContent>Ver</TooltipContent></Tooltip>
<Tooltip><TooltipTrigger><Button><Pencil /></Button></TooltipTrigger><TooltipContent>Editar</TooltipContent></Tooltip>
<Tooltip><TooltipTrigger><Button><Trash2 /></Button></TooltipTrigger><TooltipContent>Eliminar</TooltipContent></Tooltip>
```

**Despues (patron estandar):**
```text
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon" className="h-8 w-8">
      <MoreHorizontal className="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem> <Eye /> Ver detalle </DropdownMenuItem>
    <DropdownMenuItem> <Pencil /> Editar </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem className="text-destructive"> <Trash2 /> Eliminar </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

- Eliminar imports de Tooltip, TooltipContent, TooltipTrigger
- Agregar imports de DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, MoreHorizontal
- El `stopPropagation` se mueve al `<TableCell>` onClick como en EventosTable

---

### 2. Archivo nuevo: `src/pages/promolog/PromologTable.tsx`

Nueva tabla estandar para las entradas de Promolog, con el mismo patron de todas las demas tablas:

**Columnas:**

| Columna | Contenido | Ordenable |
|---------|-----------|-----------|
| Ticket | Numero PL con badge outline font-mono | Si |
| Modelo | Nombre + @handle | Si |
| Red Social | Badge con icono de red (Instagram/X/TikTok/Telegram) | Si |
| Plataforma | Badge outline (OnlyFans/Unlok/Otra) | Si |
| Resultado | Badge coloreado (Si=green, Parcial=yellow, No=red) | Si |
| Agente | Nombre del agente | Si |
| Fecha | dd MMM yyyy + hora | Si |
| Acciones | DropdownMenu con MoreHorizontal (Editar) | No |

**Patrones:**
- Contenedor: `max-h-[calc(100vh-24rem)] overflow-auto rounded-lg border border-border`
- TableHeader: `sticky top-0 z-10 bg-card`
- Columna Acciones: `sticky right-0 bg-card z-20`
- SortHeader con ArrowUpDown
- Fila clickeable para abrir detalle/edicion
- Empty state con colSpan

---

### 3. Archivo nuevo: `src/pages/promolog/PromologGrid.tsx`

Vista de grid con tarjetas basada en el componente `PromologEntryCard` existente pero en un layout de grid responsivo:

- Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`
- Cada tarjeta reutiliza la estructura visual del `PromologEntryCard` actual
- Empty state cuando no hay entradas

---

### 4. Archivo modificado: `src/pages/promolog/PromologContent.tsx`

Cambios en la seccion de "Entradas Recientes" (dentro del TabsContent "tabla"):

- Agregar estado `entryView` para toggle Lista/Grid (`"list" | "grid"`)
- Agregar toggle con iconos `List` y `LayoutGrid` junto al titulo "Entradas Recientes" y el boton de filtros
- Renderizar condicionalmente:
  - `entryView === "list"` -> `<PromologTable entries={filteredEntries} />`
  - `entryView === "grid"` -> `<PromologGrid entries={filteredEntries} />`
- Agregar contador de entradas: `{filteredEntries.length} entradas`

---

### 5. Resumen de archivos

| Archivo | Accion | Cambio |
|---------|--------|--------|
| `src/pages/tickets/TicketsList.tsx` | Modificar | Reemplazar Tooltips por DropdownMenu con MoreHorizontal |
| `src/pages/promolog/PromologTable.tsx` | Crear | Tabla estandar para entradas de Promolog |
| `src/pages/promolog/PromologGrid.tsx` | Crear | Vista grid con tarjetas de entradas |
| `src/pages/promolog/PromologContent.tsx` | Modificar | Agregar toggle List/Grid y renderizar tabla o grid |

