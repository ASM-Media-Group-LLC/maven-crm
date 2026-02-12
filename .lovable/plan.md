

# Mostrar las dos cards KPI en una sola fila

## Cambio

En `src/pages/leadgen/LeadGenContent.tsx`, la grilla de KPIs (linea 50) ya usa `grid-cols-1 lg:grid-cols-2`. El problema es que en pantallas medianas las cards se apilan. Se cambiara a `grid-cols-2` (sin breakpoint) para que siempre se muestren lado a lado.

## Detalle tecnico

**Archivo:** `src/pages/leadgen/LeadGenContent.tsx`, linea 50.

Cambiar:
```
grid grid-cols-1 lg:grid-cols-2 gap-6
```
Por:
```
grid grid-cols-2 gap-6
```

Esto fuerza las dos cards (Cantidad y Estados) a compartir el mismo espacio horizontal en todos los tamanos de pantalla.

