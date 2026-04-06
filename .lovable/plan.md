

# Plan: Reestructurar vistas de proyecto y mejorar UX

## Resumen

Tres cambios: (1) Kanban como vista default dentro de cada proyecto, (2) tooltips en todos los icon buttons, (3) mover analíticas a una pestaña/tab dedicada más visible en vez de un toggle escondido.

## Cambios

### 1. `TareasContent.tsx` — Vista de proyecto individual

**Kanban como default** — ya está como default (`useState("kanban")`), confirmado. Sin cambio necesario.

**Tooltips en icon buttons** — Envolver los botones de vista (Kanban, Lista, Analíticas) y el botón de volver con `Tooltip` + `TooltipContent`:
- Botón ArrowLeft → "Volver a proyectos"
- Botón Kanban (Columns) → "Vista Kanban"
- Botón Lista (List) → "Vista Lista"
- Botón Analíticas (BarChart3) → "Analíticas"

**Reestructurar analíticas** — En vez del toggle icon que alterna `showAnalytics`, convertirlo en una tercera pestaña visible junto a Kanban y Lista. Usar un grupo de tabs con labels de texto (no solo iconos) similar al de `ProjectsListContent`:

```text
[ 📊 Kanban ] [ 📋 Lista ] [ 📈 Analíticas ]
```

Esto reemplaza los icon buttons actuales por un grupo de tabs con texto + icono, haciéndolo más descubrible. Se elimina el estado `showAnalytics` y se agrega `"analytics"` al type de `viewMode`.

### 2. `ProjectsListContent.tsx` — Vista global

**Tooltips** — Agregar tooltips a los icon buttons de la toolbar (grid/list toggle, acciones de proyectos).

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `TareasContent.tsx` | Cambiar icon buttons por tabs con texto, agregar tooltips, integrar analíticas como tab |
| `ProjectsListContent.tsx` | Agregar tooltips a icon buttons |

## Sin dependencias nuevas
Todo usa componentes existentes (`Tooltip`, `TooltipProvider` de shadcn).

