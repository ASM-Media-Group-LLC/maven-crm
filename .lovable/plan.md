

## Problema

El header de la vista lista (`TaskListView.tsx` línea 108) tiene **6 columnas** con el grid antiguo `grid-cols-[1fr_140px_140px_100px_120px_40px]`, pero las filas (`TaskListRow.tsx` línea 125) usan **8 columnas** con `grid-cols-[1fr_110px_120px_110px_80px_80px_100px_40px]`. Están desalineados — el header no refleja las nuevas columnas de "Asignado por", "Fecha inicio" y "Fecha fin".

## Solución

**Archivo:** `src/pages/tareas/TaskListView.tsx`

Actualizar el header (línea 108) para que coincida con el grid de 8 columnas de `TaskListRow`:

```
grid-cols-[1fr_110px_120px_110px_80px_80px_100px_40px]
```

Y actualizar las etiquetas del header:
1. **Nombre** (con pl-8)
2. **Asignado por** (nuevo)
3. **Asignado a** (antes "Asignado")
4. **Prioridad**
5. **Inicio** (nuevo)
6. **Fin** (nuevo)
7. **Tiempo**
8. *(acciones)*

Esto alinea perfectamente el header con las columnas de cada fila.

