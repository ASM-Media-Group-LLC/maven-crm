

## Agregar seccion de Filtros colapsable entre las cards de redes/plataformas y Entradas Recientes

La imagen muestra una seccion "Filtros" con un Collapsible/Accordion que contiene tres selectores en fila: **Creador/a**, **Red Social** y **Estado**, seguida de una barra de tabs con **Tabla**, **Calendario** y **Campanas**.

### Cambios en `src/pages/promolog/PromologContent.tsx`

1. **Agregar import** de `Collapsible, CollapsibleContent, CollapsibleTrigger` desde `@/components/ui/collapsible` y `ChevronUp` desde lucide-react.

2. **Insertar seccion de Filtros** (entre las lineas 452 y 454, despues del cierre de "Social and Platform Section" y antes de "Entries"):
   - Un `Card` conteniendo un `Collapsible` (abierto por defecto).
   - El trigger muestra un icono de chevron animado y el titulo "Filtros".
   - El contenido muestra 3 selectores en una grilla de 3 columnas:
     - **Creador/a**: Select con "Todos" + lista de creators del query existente.
     - **Red Social**: Reutiliza el estado `selectedNetwork` con las opciones Instagram, TikTok, X, Telegram.
     - **Estado**: Reutiliza el estado `selectedStatus` con Todos, Si, No, Parcial, Pendiente.

3. **Agregar barra de tabs debajo de los filtros** con tres opciones: Tabla (icono Table2), Calendario (icono CalendarDays), Campanas (icono Target). Estas tabs controlan la vista de las entradas (reutilizando estados existentes).

4. **Mover los filtros de la barra superior** (searchEntry, selectedStatus, selectedNetwork, selectedCategory, view toggles) que estan en la barra debajo del header: se eliminan los selectores de Estado y Red Social de ahi ya que se mueven a la seccion de Filtros. Se mantiene el buscador y los toggles de vista en la barra superior.

5. **Agregar estado** `filtersOpen` (boolean, default true) para controlar el collapsible, y `selectedCreatorFilter` (string) para el filtro de creador/a.

### Estructura visual

```text
[Promociones por Red Social y Plataforma]
  ... cards existentes ...

[Card: Filtros (colapsable)]
  Creador/a: [Select: Todos]   Red Social: [Select: Todas]   Estado: [Select: Todos]

[Tabs: Tabla | Calendario | Campanas]

[Entradas Recientes]
  ... tabla/grid existente ...
```

### Archivo a modificar
- `src/pages/promolog/PromologContent.tsx`

