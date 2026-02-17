

## Estandarizar tab bars en Sales Dashboard

### Problema

Los dos tab bars en `DashboardFilters.tsx` (vista y periodo) usan un estilo custom con `bg-primary text-primary-foreground` para el tab activo y `border border-border bg-card` como contenedor. El patron estandarizado en el resto de la plataforma es:

- Contenedor: `inline-flex rounded-lg bg-muted/50 p-1`
- Tab activo: `Button variant="secondary"`
- Tab inactivo: `Button variant="ghost"`

### Archivo a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/sales-dashboard/DashboardFilters.tsx` | Reemplazar los dos grupos de tabs custom por el patron estandarizado con `Button` de shadcn |

### Detalle

**View tabs (lineas 56-71)**: Cambiar el contenedor de `flex items-center gap-1 rounded-lg border border-border bg-card p-1` a `inline-flex rounded-lg bg-muted/50 p-1`. Reemplazar los `button` nativos por componentes `Button` con `variant={activeView === tab ? "secondary" : "ghost"}` y `size="sm"`.

**Time period tabs (lineas 75-90)**: Aplicar el mismo cambio al contenedor y a los botones de periodos de tiempo, usando `variant={activePeriod === period ? "secondary" : "ghost"}` y `size="sm"`.

Esto alinea ambos tab bars con el patron visual que ya usan `DocsPage`, `DesignSystemPage`, `ComparativasHeader` y el resto de las paginas.

