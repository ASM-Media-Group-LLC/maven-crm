
# Fix: Headers y Footers fijos en Agregar Creador y Nuevo Evento

## Problema raiz

Los formularios (`NuevoCreadorForm` y `NuevoEventoForm`) ya tienen la estructura correcta internamente (`flex flex-col h-full overflow-hidden` con header shrink-0 y contenido scrollable). Sin embargo, las paginas padre (`NuevoCreador.tsx` y `NuevoEvento.tsx`) usan `min-h-screen` en el contenedor principal, lo que permite que el contenedor crezca mas alla del viewport. Esto anula el `overflow-hidden` de los formularios porque el padre nunca los restringe en altura.

El mismo problema aplica a `Creadores.tsx` y `Eventos.tsx` (las paginas de listado).

## Solucion

Cambiar `min-h-screen` a `h-screen overflow-hidden` en las 4 paginas wrapper para que el contenedor tenga una altura fija igual al viewport y no crezca. Esto permite que los hijos con `flex-1 overflow-hidden` funcionen correctamente.

## Cambios por archivo

### 1. `src/pages/NuevoCreador.tsx` (linea 9)

Cambiar:
```
<div className="flex min-h-screen w-full">
```
A:
```
<div className="flex h-screen w-full overflow-hidden">
```

### 2. `src/pages/NuevoEvento.tsx` (linea 9)

Mismo cambio:
```
<div className="flex min-h-screen w-full">
```
A:
```
<div className="flex h-screen w-full overflow-hidden">
```

### 3. `src/pages/Creadores.tsx` (linea 9)

Mismo cambio para consistencia.

### 4. `src/pages/Eventos.tsx` (linea 9)

Mismo cambio para consistencia.

## Seccion tecnica

El problema es una cadena de restricciones CSS:
- `overflow-hidden` solo funciona si el elemento tiene una altura definida
- `h-full` hereda la altura del padre
- Si el padre usa `min-h-screen`, puede crecer mas alla de 100vh, asi que los hijos nunca se restringen
- Cambiando a `h-screen overflow-hidden` se fija la altura exacta al viewport, y toda la cadena de `flex-1` + `overflow-hidden`/`overflow-auto` funciona correctamente
