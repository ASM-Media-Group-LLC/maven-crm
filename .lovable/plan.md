

## Diagnóstico

El layout actual ya tiene la mayoría de constraints correctos. El problema residual es que el wrapper interior (línea 180) usa `min-h-full min-w-full inline-flex` que puede no contener correctamente el desbordamiento en todos los casos de zoom. La estrategia correcta es:

1. La cadena de altura debe ser completamente rígida: `DialogContent (max-h-85vh)` → `content (flex-1 min-h-0 overflow-hidden)` → `grid h-full` → `columna derecha (flex-col min-h-0 overflow-hidden)` → `tarjeta (flex-col flex-1 min-h-0 overflow-hidden)` → `bodyRef (flex-1 min-h-0 overflow-auto)`.
2. El documento escalado no debe usar dimensiones fijas en el wrapper exterior — debe escalar proporcionalmente usando `transform` únicamente, con el wrapper ajustándose al espacio disponible.

## Cambios

**Archivo**: `src/pages/finanzas/facturacion/CrearInvoiceModal.tsx`

### 1. Línea 180 — Wrapper interior del visor
Cambiar de `min-h-full min-w-full inline-flex` a un contenedor que use dimensiones explícitas del documento escalado pero dentro de un wrapper de centrado absoluto:

```tsx
// De:
<div className="min-h-full min-w-full inline-flex justify-center items-start p-4">
  <div style={{ width: A4_W * zoom, height: A4_H * zoom }} className="shrink-0">

// A:
<div style={{ minHeight: '100%', minWidth: '100%', display: 'flex', justifyContent: 'center', alignItems: 'start', padding: 16 }}>
  <div style={{ width: A4_W * zoom, height: A4_H * zoom, flexShrink: 0 }}>
```

Esto es esencialmente lo mismo pero usando estilos inline para evitar cualquier conflicto de utilidades Tailwind con `inline-flex` vs `flex`. Sin embargo, el verdadero fix es más sutil:

### Enfoque definitivo

El problema real es que `inline-flex` con `min-w-full` puede hacer que el elemento sea más ancho que su padre en ciertos casos, lo que causa recálculos de layout. La solución definitiva:

**Línea 179-181** — Reemplazar el wrapper de centrado por uno que use `display: grid` con `place-items`:

```tsx
<div ref={bodyRef} className="flex-1 min-h-0 overflow-auto">
  <div
    style={{
      display: 'grid',
      placeItems: 'start center',
      minHeight: '100%',
      padding: 16,
    }}
  >
    <div style={{ width: A4_W * zoom, height: A4_H * zoom }} className="shrink-0">
```

**Por qué grid**: Un grid con `place-items` centra el contenido sin participar en el cálculo de tamaño intrínseco del padre como lo hace `inline-flex`. El `minHeight: 100%` asegura que el grid llene el viewport cuando el documento es pequeño, y el contenido simplemente desborda dentro del `overflow-auto` de `bodyRef` cuando es grande.

### Resumen de cambios
- **Línea 160**: Sin cambios (ya tiene `overflow-hidden`).
- **Líneas 180-181**: Reemplazar el wrapper `inline-flex` por un `grid` con `place-items: start center` y `minHeight: 100%`, eliminando clases Tailwind conflictivas.

