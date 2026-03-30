

## Plan: Rediseñar stats cards de LeadGen al estilo KPI estándar

### Referencia
La imagen muestra tarjetas tipo KPI como las de `CreadoresKPICards`: cada card ocupa espacio equitativo en un grid, con label arriba a la izquierda, icono con badge de color arriba a la derecha, y valor grande abajo a la izquierda. Sin porcentajes debajo.

### Cambios en `LeadGenCantidadCard.tsx`

Reemplazar el layout actual (botones compactos centrados) por un grid de cards siguiendo el patrón de `CreadoresKPICards`:

- **Layout**: `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7` (5 categorías + Total + QA)
- **Cada card**: Usar `Card`/`CardContent` de Shadcn con:
  - Label (`text-sm text-muted-foreground`) arriba izquierda
  - Icono en badge coloreado (`h-8 w-8 rounded-md`) arriba derecha
  - Valor grande (`text-2xl font-bold`) abajo izquierda con color del estado
  - Hover: `hover:scale-[1.03]` + gradiente sutil
- **Eliminar**: porcentaje debajo del valor, layout centrado vertical
- **Mantener**: funcionalidad de filtro por click en categorías, estado activo con borde/fondo de color
- **Iconos**: Usar iconos de Lucide apropiados por categoría (Star para A+, TrendingUp para A, etc.), Users para Total, PhoneCall para QA

### Archivo
- `src/pages/leadgen/LeadGenCantidadCard.tsx` — rediseño completo

