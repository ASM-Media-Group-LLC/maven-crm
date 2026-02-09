

# Ajustar grid de Creadores a 4 cards por fila

## Cambio

Modificar las clases de grid en `CreadoresGrid.tsx` para que siempre se muestren 4 tarjetas por fila en pantallas grandes.

## Detalle tecnico

### Archivo: `src/pages/creadores/CreadoresGrid.tsx`

Cambiar la clase del contenedor grid de:

```
grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4
```

a:

```
grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4
```

Esto hace que a partir de `lg` (1024px) ya se muestren 4 columnas, en lugar de esperar a `xl` (1280px).

