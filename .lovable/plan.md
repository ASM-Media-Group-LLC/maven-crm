
# Ajustar diseno de filtros de agencia

## Cambio

Envolver los botones de agencia en un contenedor con borde redondeado y fondo sutil, y cambiar los botones inactivos de `outline` a `ghost` para que no tengan borde individual visible. El resultado sera una barra de tabs contenida, como en la imagen de referencia.

## Detalle tecnico

### Archivo: `src/pages/creadores/CreadoresContent.tsx`

Linea 58: Cambiar el `div` contenedor de:

```tsx
<div className="flex flex-wrap gap-2">
```

A:

```tsx
<div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
```

Lineas 60 y 69: Cambiar la variante de los botones inactivos de `"outline"` a `"ghost"` para eliminar bordes individuales. El boton activo mantiene `"secondary"`.

- `variant={filters.agency === "" ? "secondary" : "ghost"}` (linea 60)
- `variant={filters.agency === agency ? "secondary" : "ghost"}` (linea 69)

## Resultado visual

- Contenedor con borde redondeado y fondo sutil (`muted/50`)
- Boton activo resaltado con fondo `secondary`
- Botones inactivos sin borde, solo texto con hover
- Spacing compacto con `gap-1` y `p-1`
