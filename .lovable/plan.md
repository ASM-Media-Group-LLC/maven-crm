

# Hover con gradiente en KPI cards + Placeholders en filtros

## 1. KPI Cards -- hover con gradiente y escala

Cada card tendra un efecto hover con dos comportamientos:
- **Escala sutil**: `hover:scale-[1.03]` para que la card "crezca" ligeramente
- **Fondo con gradiente**: un `bg-gradient-to-br` que va desde el color tematico (con opacidad baja) hacia transparente

Como Tailwind no permite aplicar gradientes condicionales en hover de forma directa con variables CSS dinamicas, se usara un approach con `style` inline para el gradiente, activado via un estado o clase CSS custom. Sin embargo, para mantenerlo simple y sin JS adicional, se puede lograr con clases Tailwind usando `hover:bg-gradient-to-br` combinado con colores fijos por card.

Dado que cada card ya tiene un `hoverClass` unico, se actualizara asi:

| Card | hoverClass |
|---|---|
| Activas | `hover:scale-[1.03] hover:bg-gradient-to-br hover:from-success/15 hover:to-transparent hover:border-success/40` |
| Onboarding | `hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:to-transparent hover:border-primary/40` |
| Pausadas | `hover:scale-[1.03] hover:bg-gradient-to-br hover:from-warning/15 hover:to-transparent hover:border-warning/40` |
| Retiros | `hover:scale-[1.03] hover:bg-gradient-to-br hover:from-destructive/15 hover:to-transparent hover:border-destructive/40` |
| Terminadas | `hover:scale-[1.03] hover:bg-gradient-to-br hover:from-muted-foreground/10 hover:to-transparent hover:border-muted-foreground/20` |

La clase general de la card sera `transition-all duration-200`.

**Archivo:** `src/pages/creadores/CreadoresKPICards.tsx`

## 2. Filtros Select -- placeholder por nombre del filtro

Actualmente el `FilterSelect` muestra "Todos" como valor por defecto cuando no hay filtro seleccionado. El cambio consiste en:

1. Cuando `value` es vacio (sin filtro activo), el Select no tendra un valor seleccionado (`value` sera `undefined`), permitiendo que el `placeholder` del `SelectValue` se muestre naturalmente.
2. La opcion "Todos" seguira existiendo en el dropdown para poder limpiar el filtro, pero no sera el valor por defecto visible.
3. Se ajustaran los placeholders para que coincidan con los nombres correctos:
   - "Estados" (ya correcto)
   - "Categorias" (ya correcto)
   - "Paises" (ya correcto)
   - "Ciudades" (ya correcto)
   - "Managers" (ya correcto)

El cambio tecnico: en `FilterSelect`, cuando `value` es vacio, se pasara `value={undefined}` al `Select` en lugar de `value="__all__"`. Esto hara que Radix muestre el placeholder.

**Archivo:** `src/pages/creadores/CreadoresFilters.tsx`

## Resumen de archivos

| Archivo | Cambio |
|---|---|
| `src/pages/creadores/CreadoresKPICards.tsx` | Hover con gradiente + scale |
| `src/pages/creadores/CreadoresFilters.tsx` | Placeholder visible por defecto en lugar de "Todos" |

