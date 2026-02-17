

## Agregar "Limpiar filtros" condicional en todas las tablas principales

### Situacion actual

Solo **Promolog** tiene un boton "Limpiar filtros", pero siempre esta visible (incluso sin filtros aplicados). Las demas paginas principales no tienen esta funcionalidad:

| Pagina | Tiene filtros | Tiene "Limpiar filtros" |
|--------|:---:|:---:|
| Promolog | Si | Si (siempre visible) |
| Eventos | Si | No |
| Contactos | Si | No |
| Creadores | Si | No |
| Tickets | Si | No |
| Closers | Si | No |
| LeadGen | Si | No |

### Cambios

En cada pagina, agregar un boton "Limpiar filtros" (icono X + texto) que **solo aparece cuando al menos un filtro esta activo** (distinto de su valor por defecto). Al hacer clic, resetea todos los filtros a sus valores vacios.

#### Archivos a modificar

| Archivo | Detalle |
|---------|---------|
| `src/pages/promolog/PromologContent.tsx` | Hacer que el boton existente solo sea visible cuando hay filtros activos |
| `src/pages/eventos/EventosFilters.tsx` | Agregar boton "Limpiar filtros" condicional + recibir prop `onClear` |
| `src/pages/eventos/EventosContent.tsx` | Pasar `onClear` y logica de `hasActiveFilters` al componente de filtros |
| `src/pages/contactos/ContactosFilters.tsx` | Agregar boton condicional + recibir props `onClear` y `hasActiveFilters` |
| `src/pages/contactos/ContactosContent.tsx` | Calcular `hasActiveFilters` y pasar `onClear` |
| `src/pages/creadores/CreadoresFilters.tsx` | Agregar boton condicional + recibir props |
| `src/pages/creadores/CreadoresContent.tsx` | Calcular `hasActiveFilters` y pasar `onClear` |
| `src/pages/tickets/TicketsFilters.tsx` | Agregar boton condicional |
| `src/pages/tickets/TicketsContent.tsx` | Pasar `onClear` y `hasActiveFilters` |
| `src/pages/closers/ClosersContent.tsx` | Agregar boton inline (filtros estan en el mismo componente) |
| `src/pages/leadgen/LeadGenContent.tsx` | Agregar boton inline (filtros estan en el mismo componente) |

### Detalle tecnico

**Patron comun para cada pagina:**

1. Calcular si hay filtros activos comparando el estado actual contra los valores vacios:
```tsx
const hasActiveFilters = filters.search !== "" || filters.status !== "" || /* etc */;
```

2. Mostrar el boton condicionalmente junto a los demas filtros:
```tsx
{hasActiveFilters && (
  <Button variant="ghost" size="sm" onClick={onClear}>
    <X className="mr-1.5 h-4 w-4" />
    Limpiar filtros
  </Button>
)}
```

3. El handler `onClear` resetea todos los valores a su estado inicial (cadena vacia, undefined para fechas, etc.)

**Para Promolog** solo se envuelve el boton existente en la condicion `hasActiveFilters`.

**Para paginas con filtros inline** (Closers, LeadGen) se agrega directamente en el componente Content.

**Para paginas con componente Filters separado** (Eventos, Contactos, Creadores, Tickets) se pasan las props `hasActiveFilters` y `onClear` al componente de filtros.

