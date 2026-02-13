

## Corregir filtros inline en Promolog y botones en LeadGen

### Problemas identificados

1. **Promolog**: Los filtros siguen dentro de un Sheet lateral. Deben estar inline antes de la tabla/grid, igual que en Creadores (buscar + selects en una fila horizontal).
2. **LeadGen**: El boton "+ Lead" usa `variant="default"` (azul/primary) en el header en lugar de `variant="outline"`. El toggle list/grid usa `variant="default"` en lugar de `variant="secondary"`.
3. **Promolog toggle list/grid**: Esta dentro de la seccion "Entradas Recientes" junto al boton de filtros (Sheet). Debe moverse a la fila de filtros inline, alineado a la derecha como en Creadores.

---

### 1. Archivo modificado: `src/pages/promolog/PromologContent.tsx`

**Cambios:**

- Eliminar el Sheet de filtros completamente (lineas 548-651): quitar `filtersOpen` state, eliminar imports de Sheet/SheetContent/SheetHeader/SheetTitle/SheetFooter.
- Eliminar el boton de filtros (icono Filter) de la seccion "Entradas Recientes".
- Agregar una fila de filtros inline antes de la tabla/grid (dentro de TabsContent "tabla"), con el mismo patron de CreadoresFilters:

```text
<div className="flex items-center gap-3">
  <div className="relative w-48">
    <Search icon />
    <Input placeholder="Buscar entrada..." />
  </div>
  <FilterSelect placeholder="Estado" options={[Si, No, Parcial, Pendiente]} />
  <FilterSelect placeholder="Red Social" options={[Instagram, TikTok, X, Telegram]} />
  <FilterSelect placeholder="Categoría" options={[A+, A, B+, B, C]} />
  <div className="ml-auto flex gap-1">
    <Button variant={secondary/ghost} size="icon"> List </Button>
    <Button variant={secondary/ghost} size="icon"> LayoutGrid </Button>
  </div>
</div>
```

- El titulo "Entradas Recientes" con el contador se mantiene encima de los filtros inline.
- Los filtros aplican directamente (sin boton "Aplicar"), igual que en Creadores.
- Eliminar los estados `appliedFilters`, `filtersOpen` y simplificar el filtrado usando los valores directos de los selects.

---

### 2. Archivo modificado: `src/pages/leadgen/LeadGenContent.tsx`

**Cambios en el header (lineas 81-89):**

- Boton "+ Lead": cambiar de `<Button size="sm">` (default/primary) a `<Button variant="outline" size="sm">` para seguir el patron del header.
- Reordenar: "Contacto" puede quedarse como `variant="outline"` tambien, ambos son acciones del header.

**Cambios en el toggle list/grid (lineas 197-214):**

- Cambiar `variant={viewMode === "list" ? "default" : "ghost"}` a `variant={viewMode === "list" ? "secondary" : "ghost"}`
- Cambiar `variant={viewMode === "grid" ? "default" : "ghost"}` a `variant={viewMode === "grid" ? "secondary" : "ghost"}`
- Eliminar el wrapper `<div className="flex border rounded-md">` y usar el patron estandar sin borde exterior (botones sueltos con gap-1 como en CreadoresFilters y TicketsFilters).

---

### Resumen de archivos

| Archivo | Accion | Cambio |
|---------|--------|--------|
| `src/pages/promolog/PromologContent.tsx` | Modificar | Reemplazar Sheet de filtros por filtros inline, mover toggle list/grid a fila de filtros |
| `src/pages/leadgen/LeadGenContent.tsx` | Modificar | Corregir variant de boton Lead a outline, corregir toggle list/grid a secondary/ghost |

