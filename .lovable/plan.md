

## Convertir filtros de Promolog a panel lateral (Sheet)

### Problema
Actualmente los filtros estan dentro de un Collapsible inline en la pagina. El usuario quiere que al hacer clic en el boton de filtros (icono de Filter en "Entradas Recientes"), se abra un panel lateral derecho (Sheet) con el titulo "Filtros de Tickets" y los filtros organizados verticalmente, tal como se ve en la imagen de referencia.

### Cambios en la imagen de referencia
El panel lateral incluye:
- Titulo "Filtros de Tickets" con boton de cierre (X)
- Campo "Promociono?" con dropdown (Todos)
- Campo "Modelo" con dropdown (Todas las modelos)
- Campo "Categoria de Modelo" con dropdown (Todas las categorias)
- Campo "Red Social" con dropdown (Todas las redes)
- Boton "Limpiar filtros" (outline)
- Boton "Aplicar filtros" (primario)

### Solucion

**Archivo:** `src/pages/promolog/PromologContent.tsx`

1. **Eliminar el bloque Collapsible de filtros** (lineas 370-431): Remover la Card con el Collapsible que contiene los filtros inline, ya que seran reemplazados por el Sheet.

2. **Reemplazar el boton de Filter en "Entradas Recientes"** (linea 455): Conectar el boton de filtros existente (icono Filter) para que abra el Sheet en lugar de no hacer nada.

3. **Agregar el Sheet con los filtros**: Usar el componente Sheet (side="right") con:
   - SheetHeader con titulo "Filtros de Tickets"
   - 4 campos de filtro en layout vertical (space-y-6):
     - "Promociono?" con opciones: Todos, Promociono, No promociono, Promocion Parcial, Pendiente
     - "Modelo" con la lista de creators de la base de datos (placeholder "Todas las modelos")
     - "Categoria de Modelo" con opciones: Todas las categorias (placeholder por ahora)
     - "Red Social" con opciones: Todas las redes, Instagram, TikTok, X/Twitter, OnlyFans, Treat, Telegram
   - SheetFooter con dos botones: "Limpiar filtros" (variant outline) y "Aplicar filtros" (variant default/primario)

4. **Reutilizar el estado `filtersOpen`** existente para controlar la apertura/cierre del Sheet.

5. **Agregar imports**: Importar Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter desde `@/components/ui/sheet`.

6. **Remover imports innecesarios**: Eliminar Collapsible, CollapsibleTrigger, CollapsibleContent y ChevronDown ya que no se usaran mas en este componente.

### Detalle tecnico

El boton de filtros en la seccion "Entradas Recientes" (linea 455) pasara a tener `onClick={() => setFiltersOpen(true)}`. El Sheet usara `open={filtersOpen}` y `onOpenChange={setFiltersOpen}` para controlar su visibilidad. Los campos del Sheet seguiran un layout vertical con `space-y-6` y cada campo tendra su label (`text-sm font-medium`) encima del Select.

