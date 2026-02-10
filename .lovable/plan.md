
# Hacer clic en el nombre del creador para abrir modal de vista

## Cambio

Agregar un `onClick` handler a la celda del nombre del creador en la tabla para que al hacer clic se abra el `ViewCreadorModal`.

## Detalle tecnico

### Archivo: `src/pages/creadores/CreadoresTable.tsx`

En la celda `<TableCell>` que contiene el avatar y nombre del creador (linea ~137), agregar un `onClick` que llame a `setViewingCreator(c)` y un `cursor-pointer` para indicar que es clickeable:

```tsx
// Antes
<TableCell>
  <div className="flex items-center gap-3">

// Despues
<TableCell className="cursor-pointer" onClick={() => setViewingCreator(c)}>
  <div className="flex items-center gap-3">
```

No se requieren cambios adicionales ya que el estado `viewingCreator` y el `ViewCreadorModal` ya existen en el componente.
