

## Ajustar grid a 2 tarjetas por fila

### Cambio

**Archivo**: `src/pages/leadgen/LeadGenGrid.tsx` (linea 79)

Cambiar la clase de la grilla de:
```
grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4
```
a:
```
grid grid-cols-1 sm:grid-cols-2 gap-4
```

Esto elimina el breakpoint `lg:grid-cols-3` para que en pantallas medianas y grandes siempre se muestren maximo 2 tarjetas por fila.

