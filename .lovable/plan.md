

# Deshabilitar boton "Crear categoria" si el campo de nombre esta vacio

## Resumen

Agregar validacion al boton "Crear categoria" para que este deshabilitado (disabled) mientras el campo de nombre no tenga contenido.

## Cambio

### Archivo: `src/pages/creadores/LineamientosTabContent.tsx` (linea 265)

Modificar la condicion `disabled` del boton para incluir la validacion del titulo:

```tsx
// Antes
disabled={upsertMutation.isPending}

// Despues
disabled={upsertMutation.isPending || !inlineTitle.trim()}
```

Esto mantiene la validacion existente de "mutation en progreso" y agrega que el titulo no puede estar vacio. La descripcion sigue siendo opcional.

