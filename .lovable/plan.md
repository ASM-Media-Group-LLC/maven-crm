

## Ajustar cards de Red Social y Plataforma al mismo tamaño

### Problema
Las cards de "Red Social" (4 columnas) y "Plataforma" (3 columnas) tienen tamaños diferentes porque usan grids distintos (`grid-cols-4` vs `grid-cols-3`). Las de plataforma se ven mas anchas.

### Solucion

**Archivo:** `src/pages/promolog/PromologContent.tsx`

**Cambio 1 - Unificar grid de Plataforma:**
Cambiar el grid de plataforma de `grid-cols-3` a `grid-cols-2 sm:grid-cols-4` para que ambas secciones usen el mismo grid. Las 3 cards de plataforma ocuparan 3 de las 4 columnas, dejando la cuarta vacia, pero todas las cards tendran el mismo ancho que las de red social.

**Cambio 2 - Unificar iconos de plataforma:**
Los iconos de las social cards usan `h-6 w-6` pero los de plataforma usan `h-8 w-8` (circulos). Reducir los circulos de plataforma a `h-6 w-6` para que coincidan visualmente con los iconos de redes sociales.

### Detalle tecnico

Linea 331: cambiar `grid-cols-3` a `grid-cols-2 sm:grid-cols-4`

Iconos de plataforma (datos mock, lineas ~47-68): cambiar `h-8 w-8` a `h-6 w-6` en los 3 spans de iconos de plataforma, y reducir el texto interno de `text-xs` a `text-[10px]` para que quepa en el circulo mas pequeno.

