

## Plan: Mejorar visibilidad en cards de proyectos y header interno

### Problemas identificados

**Cards de proyectos (grid):**
- Los conteos de tareas pendientes/completadas son muy pequeños (`text-xs`) y se muestran condicionalmente (si hay 0 no aparecen), lo que los hace difíciles de leer.
- El líder usa `text-sm` pero sigue siendo discreto entre otros elementos.

**Header interno del proyecto:**
- La descripción se muestra en una sola línea larga (`line-clamp-2`) pegada al título, ocupando todo el ancho y viéndose alargada.
- La barra de progreso está en una fila secundaria con `max-w-md`, se pierde visualmente.
- El líder del proyecto no se distingue bien — aparece como texto plano en la misma fila que el progreso.

### Cambios propuestos

#### 1. `src/pages/tareas/ProjectsListContent.tsx` — Cards de proyecto más legibles

- **Conteos de tareas**: Mostrar siempre pendientes y completadas (no condicionalmente), con texto más grande (`text-sm` en vez de `text-xs`), y usar formato legible como `⏳ 1 pendiente · ✓ 0 completadas`.
- **Líder**: Moverlo a una posición más prominente debajo del nombre del proyecto, con un avatar pequeño + nombre en `text-sm font-semibold`.
- **Progress bar**: Mantener el grosor actual (`h-2.5`) que ya es razonable.

#### 2. `src/pages/tareas/TareasContent.tsx` — Rediseñar header interno

- **Descripción**: Limitar el ancho con `max-w-2xl` y usar `line-clamp-2` para que no se vea alargada a todo el ancho de la pantalla.
- **Líder**: Mostrarlo con un avatar + nombre más destacado, usando `text-base font-semibold` y un badge/chip visual en vez de texto plano.
- **Progress bar**: Integrarla en una card resumen compacta debajo del título (estilo banner) que contenga el líder + progreso + conteo rápido de tareas, en vez de tenerla suelta en una fila genérica.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/tareas/ProjectsListContent.tsx` | Conteos siempre visibles y más grandes, líder más prominente |
| `src/pages/tareas/TareasContent.tsx` | Descripción con ancho limitado, líder con chip/badge, progreso en banner compacto |

