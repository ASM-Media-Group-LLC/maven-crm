

# Plan: Mejorar layout del detalle de tarea

## Problemas identificados

1. **Botón eliminar se cruza con el X de cerrar**: El `DialogContent` tiene un botón X absoluto en `right-4 top-4`, y el header del TaskDetailPage pone el botón de eliminar en la misma zona.
2. **Inconsistencia en meta grid**: Prioridad y Vencimiento muestran el valor debajo del label, pero Inicio y Duración lo muestran al lado (en la imagen se ve "Inicio02 abr 2026" y "Duración98h 20m" sin espacio).
3. **Falta de espaciado**: Los campos del meta grid están apretados.

## Cambios

### 1. Eliminar X duplicado — `TaskDetailPage.tsx`
El `DialogContent` ya renderiza un botón X (línea 45 de dialog.tsx). El header del task detail tiene su propio botón de cerrar/eliminar que se superpone. Solución: ocultar el X del DialogContent pasando una clase personalizada, y manejar el cierre desde el header propio del componente, asegurando que eliminar y cerrar estén separados con suficiente gap.

### 2. Reorganizar header — `TaskDetailPage.tsx` (líneas 89-117)
- Mover el botón de eliminar lejos del X de cierre: ponerlo a la izquierda junto al status, o agregar `mr-8` al contenedor de botones para dejar espacio al X del dialog.

### 3. Consistencia en meta grid — `TaskDetailPage.tsx` (líneas 171-217)
Cambiar TODOS los campos a formato vertical consistente (label arriba, valor abajo):
```
Prioridad        Vencimiento         Inicio           Duración          Tipo
[badge]          10 abr 2026, 19:00  02 abr 2026      98h 20m           [select]
```
- Cada campo usa `space-y-1` con label `text-xs` arriba y valor `text-sm` debajo
- Agregar iconos faltantes a Inicio y Duración
- Aumentar gap del grid a `gap-5`

## Archivos modificados
| Archivo | Cambio |
|---------|--------|
| `TaskDetailPage.tsx` | Separar botón eliminar del X, consistencia vertical en meta grid, mejor espaciado |

