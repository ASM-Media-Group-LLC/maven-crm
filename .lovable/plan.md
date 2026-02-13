

## Eliminar vista Pipeline de Closers

### Cambios

**Archivo: `src/pages/closers/ClosersContent.tsx`**
- Eliminar import de `PipelineBoard` y `Columns3`
- Cambiar tipo `ViewMode` de `"pipeline" | "table" | "grid"` a `"table" | "grid"`
- Cambiar estado inicial de `viewMode` de `"pipeline"` a `"table"`
- Eliminar el boton toggle de Pipeline (Columns3) del toggle de vistas
- Eliminar la condicion `viewMode === "pipeline"` del renderizado, dejando solo table y grid

**Archivo: `src/pages/closers/PipelineBoard.tsx`**
- Eliminar el archivo completo ya que no se usa en ningun otro lugar

### Resumen

| Archivo | Accion |
|---------|--------|
| `src/pages/closers/ClosersContent.tsx` | Modificar: quitar pipeline, dejar solo table/grid |
| `src/pages/closers/PipelineBoard.tsx` | Eliminar |

