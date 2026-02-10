

# Mover icono RefreshCw a la esquina superior derecha de la tarjeta

## Cambio

Mover el icono `RefreshCw` de su posicion actual (dentro de la fila de badges, con `ml-auto`) a la esquina superior derecha de la tarjeta, fuera del flujo del contenido.

## Detalle tecnico

### Archivo: `src/pages/creadores/CreadoresGrid.tsx`

1. Agregar `relative` al contenedor `CardContent` (linea 82) para permitir posicionamiento absoluto del icono.

2. Remover el `<RefreshCw>` de la linea 105 (dentro del div de badges).

3. Agregar el icono como elemento posicionado absolutamente en la esquina superior derecha del `CardContent`:

```tsx
<CardContent className="p-4 space-y-3 relative">
  <RefreshCw className="absolute top-4 right-4 h-3 w-3 text-muted-foreground" />
  {/* resto del contenido sin cambios */}
</CardContent>
```

4. Sin cambios en otros archivos ni en la logica del componente.

