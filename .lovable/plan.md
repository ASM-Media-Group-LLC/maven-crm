

## Estandarizar Promolog, Tickets y Botones al Patron Definido

Cuatro correcciones para alinear Promolog y Tickets con el patron de Creadores/Eventos, y documentar las reglas de uso de botones en el Design System.

---

### 1. Restructurar header de PromologContent

**Problema:** El header actual esta dentro de un `<main>` con scroll general. No tiene el patron de header sticky con `border-b` y el boton "Agregar Entrada" esta en una barra de acciones separada, lejos del titulo.

**Solucion:** Reestructurar para seguir exactamente el patron de EventosContent/CreadoresContent:

```text
<main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
  <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold">Promolog</h1>
        <p className="text-sm text-muted-foreground">Seguimiento promocional diario</p>
      </div>
      <Button variant="outline">
        <Plus className="mr-2 h-4 w-4" /> Agregar Entrada
      </Button>
    </div>
  </header>
  <div className="flex-1 overflow-auto p-6 space-y-6">
    {/* action bar (fecha, agentes, campanas), KPIs, filtros inline, tabla/grid */}
  </div>
</main>
```

Los botones secundarios de la barra de acciones (fecha, ver agentes, campanas) se mueven al area scrollable debajo del header. Los filtros (Sheet lateral) y el toggle list/grid se extraen a una fila de filtros inline siguiendo el patron de EventosFilters, justo antes de la tabla/grid, fuera del Sheet.

---

### 2. Restructurar header de TicketsContent

**Problema:** Mismo issue: el header de Tickets esta dentro de un `<main>` con scroll general, sin la estructura sticky.

**Solucion:** Aplicar el mismo patron:

```text
<main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
  <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold">Customer Service</h1>
        <p className="text-sm text-muted-foreground">Gestion de soporte y escalaciones</p>
      </div>
      <Button variant="outline">
        <Plus className="mr-2 h-4 w-4" /> Nuevo Ticket
      </Button>
    </div>
  </header>
  <div className="flex-1 overflow-auto p-6 space-y-6">
    {/* tabs, filtros, tabla/grid */}
  </div>
</main>
```

---

### 3. Agregar acciones completas en PromologTable

**Problema:** El DropdownMenu de la tabla solo tiene "Editar". Falta "Ver detalle" y "Eliminar" con separador, como en todas las demas tablas.

**Solucion:** Agregar props `onView` y `onDelete` al componente y completar el DropdownMenu:

```text
<DropdownMenuContent align="end">
  <DropdownMenuItem> <Eye /> Ver detalle </DropdownMenuItem>
  <DropdownMenuItem> <Pencil /> Editar </DropdownMenuItem>
  <DropdownMenuSeparator />
  <DropdownMenuItem className="text-destructive"> <Trash2 /> Eliminar </DropdownMenuItem>
</DropdownMenuContent>
```

---

### 4. Corregir variante de botones de toggle list/grid

**Problema:** En Tickets y Promolog, el toggle usa `variant="default"` (azul/primary) para el activo. En Creadores y Eventos usa `variant="secondary"` (gris) para el activo y `variant="ghost"` para el inactivo. Esto crea inconsistencia visual -- en unos modulos el toggle aparece azul/violeta, en otros gris.

**Patron correcto** (de CreadoresFilters y EventosFilters):
- Activo: `variant="secondary"`
- Inactivo: `variant="ghost"`

**Archivos a corregir:**
- `TicketsFilters.tsx`: cambiar `variant="default"` a `variant="secondary"` y `variant="outline"` a `variant="ghost"`
- `PromologContent.tsx`: cambiar `variant="default"` a `variant="secondary"` y `variant="ghost"` (ya correcto el inactivo)

Ademas, el boton principal del header ("Agregar Entrada", "Nuevo Ticket") debe usar `variant="outline"` como en Creadores ("Agregar Creador") y Eventos ("Crear Evento"), no `variant="default"`.

---

### 5. Actualizar Design System - Seccion de Botones

**Problema:** La seccion de botones documenta las variantes pero no las reglas de uso contextual, lo que causa confusion sobre cuando usar primary vs outline.

**Agregar subseccion "Uso contextual"** en ButtonsSection.tsx:

| Contexto | Variante | Ejemplo |
|----------|----------|---------|
| Accion principal del header de pagina | `outline` | "Crear Evento", "Agregar Creador", "Nuevo Ticket" |
| Toggle activo (list/grid, tabs) | `secondary` | Icono List seleccionado |
| Toggle inactivo | `ghost` | Icono Grid no seleccionado |
| Accion principal dentro de un modal/form | `default` | "Guardar", "Crear" |
| Acciones destructivas | `destructive` | "Eliminar" |
| Acciones secundarias en modales | `outline` | "Cancelar" |

---

### Resumen de archivos

| Archivo | Accion | Cambio |
|---------|--------|--------|
| `src/pages/promolog/PromologContent.tsx` | Modificar | Reestructurar header sticky, mover filtros inline, corregir toggle variant |
| `src/pages/tickets/TicketsContent.tsx` | Modificar | Reestructurar header sticky, mover boton al header |
| `src/pages/tickets/TicketsFilters.tsx` | Modificar | Corregir variant del toggle list/grid |
| `src/pages/promolog/PromologTable.tsx` | Modificar | Agregar acciones Ver detalle y Eliminar al DropdownMenu |
| `src/pages/design-system/sections/ButtonsSection.tsx` | Modificar | Agregar subseccion de uso contextual |

