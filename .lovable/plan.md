

# Corregir scroll en la página LeadGen

## Problema

El contenedor principal de `LeadGenContent.tsx` (línea 25) tiene `overflow-hidden`, lo que impide hacer scroll. Las secciones fijas (header, KPIs, tabs, filtros) ocupan mucho espacio vertical -- especialmente en pantallas pequeñas -- y no queda espacio visible para el área de contenido. Como el padre bloquea el scroll, no se puede bajar para ver el resto de la página.

## Solución

Cambiar la estrategia de layout en `src/pages/leadgen/LeadGenContent.tsx`:

- Reemplazar `overflow-hidden` por `overflow-auto` en el contenedor principal (línea 25), para que toda la página sea scrollable cuando el contenido excede el viewport.

## Detalle técnico

**Archivo:** `src/pages/leadgen/LeadGenContent.tsx`, línea 25.

Cambiar:
```
<main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
```
Por:
```
<main className="flex-1 flex flex-col h-full overflow-auto min-w-0">
```

Esto permite que todo el contenido de la página sea accesible mediante scroll, manteniendo el layout flex existente.
