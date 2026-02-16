

## Aumentar tamano del input de subtareas

### Problema

El input para ingresar subtareas tiene `h-7` (28px de alto) y `text-xs` (12px), lo cual es demasiado pequeno y dificulta la escritura.

### Cambio

| Archivo | Cambio |
|---------|--------|
| `src/pages/tareas/SubtasksPanel.tsx` | Aumentar el input de `h-7 text-xs` a `h-9 text-sm min-w-[180px]`. Ajustar los controles adyacentes (prioridad, fecha, asignar) de `h-7` a `h-8` para mantener proporcion visual. |

### Detalle

- Input titulo: de `h-7 text-xs min-w-[120px]` a `h-9 text-sm min-w-[180px]`
- Select prioridad: de `h-7 text-[10px]` a `h-8 text-xs`
- Boton fecha: de `h-7 text-[10px]` a `h-8 text-xs`
- Boton asignar: de `h-7 text-[10px]` a `h-8 text-xs`
- Boton agregar (+): de `h-7 w-7` a `h-8 w-8`
- Gap del contenedor: de `gap-1.5` a `gap-2`

Esto hace el formulario mas comodo sin romper el layout compacto de la card.

