

## Ajustar layout de KPI cards en Personalizados

### Problema

Las 5 tarjetas de metricas usan `grid-cols-2 md:grid-cols-5`, lo que causa que en pantallas medianas las columnas sean demasiado estrechas y el contenido se corte visualmente. Ademas, con 5 tarjetas en `grid-cols-2`, la quinta queda sola en una fila.

### Solucion

**Archivo:** `src/pages/creadores/personalizados/PersonalizadosPage.tsx` (linea 113)

1. Cambiar el grid de `grid-cols-2 md:grid-cols-5` a `grid-cols-2 md:grid-cols-3 xl:grid-cols-5` para que las tarjetas tengan mas espacio en pantallas medianas (3 columnas) y solo colapsen a 5 columnas en pantallas grandes.

2. Reducir el gap de `gap-4` a `gap-3` para aprovechar mejor el espacio disponible.

**Archivo:** `src/components/dashboard/DashboardMetricCard.tsx`

3. Agregar `min-w-0` y `overflow-hidden` al Card para evitar desbordamientos, y `truncate` al label para que textos largos no rompan el layout. Reducir el valor de `text-2xl` a `text-xl` para que encaje mejor en columnas estrechas.

### Cambios puntuales

- Grid container: `grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3`
- Card: agregar `min-w-0`
- Texto del valor: `text-xl` en lugar de `text-2xl`
- Label: agregar `truncate`

