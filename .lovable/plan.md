

# Corregir scroll horizontal en /creadores

## Problema

El contenedor `flex-1` que envuelve el contenido no tiene restriccion de ancho minimo. En flexbox, los hijos no se encogen por debajo de su contenido a menos que se aplique `min-w-0` o `overflow-hidden`. Esto causa que el grid empuje el contenido mas alla del sidebar, generando scroll horizontal.

## Solucion

Aplicar `min-w-0` y `overflow-hidden` en los contenedores necesarios para que el contenido respete el espacio disponible junto al sidebar.

## Cambios

### 1. `src/pages/Creadores.tsx` (linea 11)

Agregar `min-w-0` al div contenedor del contenido:

```
// Antes
<div className="flex flex-1 flex-col">

// Despues
<div className="flex flex-1 flex-col min-w-0">
```

### 2. `src/pages/creadores/CreadoresContent.tsx` (linea 34)

Agregar `min-w-0` al main para reforzar la restriccion:

```
// Antes
<main className="flex-1 overflow-auto p-6 space-y-6">

// Despues
<main className="flex-1 overflow-auto p-6 space-y-6 min-w-0">
```

Estos dos cambios aseguran que la cadena de flexbox respete el ancho del sidebar y el grid se ajuste al espacio disponible sin generar scroll horizontal.
