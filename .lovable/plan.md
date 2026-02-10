

# Agregar espacio superior en el header del modal ViewCreador

## Problema

El boton "Perfil Completo" y el boton de cerrar (X) del modal estan muy cerca o se superponen visualmente en la esquina superior derecha.

## Solucion

Agregar padding superior al contenedor del header para dejar espacio libre donde se posiciona el boton X (que esta posicionado con `absolute right-4 top-4` en el DialogContent).

## Cambio tecnico

### Archivo: `src/pages/creadores/ViewCreadorModal.tsx` (linea 102)

Agregar `pt-4` al div que contiene el avatar, nombres y boton de perfil completo:

```tsx
// Antes
<div className="flex items-start gap-4">

// Despues
<div className="flex items-start gap-4 pr-8">
```

Agregar `pr-8` para que el contenido no choque con el boton X posicionado en `right-4 top-4`. Esto da suficiente margen a la derecha para que el boton "Perfil Completo" y la X no interfieran.

