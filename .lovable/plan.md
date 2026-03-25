

## Diagnóstico

La tarjeta del visor cambia de altura porque la cadena de constraints no está correctamente cerrada:

- **Línea 160** (tarjeta) tiene `flex-1 min-h-0` pero **sin `overflow-hidden`**, así que su contenido intrínseco puede influir en su tamaño antes de que flex lo restrinja.
- **Línea 159** (columna derecha) tiene `overflow-hidden` que luego recorta el exceso, causando el corte visual.

La solución es asegurar que la tarjeta (línea 160) tenga `overflow-hidden` para contener a sus hijos, y que el scroll viva exclusivamente en `bodyRef` (línea 179).

## Cambio propuesto

**Archivo**: `src/pages/finanzas/facturacion/CrearInvoiceModal.tsx`

**Línea 160** — Agregar `overflow-hidden` de vuelta a la tarjeta del visor:
```tsx
// De:
className="bg-muted/40 rounded-xl border border-border flex flex-col flex-1 min-h-0"
// A:
className="bg-muted/40 rounded-xl border border-border flex flex-col flex-1 min-h-0 overflow-hidden"
```

**Línea 180** — Cambiar `h-full w-full` por dimensiones mínimas para que el contenido pueda crecer y activar el scroll del padre:
```tsx
// De:
className="h-full w-full box-border flex justify-center items-start p-4"
// A:
className="inline-flex justify-center p-4"
```

Y envolver con un contenedor que garantice centrado cuando el documento es más pequeño que el viewport:
```tsx
<div ref={bodyRef} className="flex-1 min-h-0 overflow-auto">
  <div className="min-h-full min-w-full inline-flex justify-center items-start p-4">
    <div style={{ width: A4_W * zoom, height: A4_H * zoom }} className="shrink-0">
      ...
    </div>
  </div>
</div>
```

Con `min-h-full min-w-full`, el contenedor llena el viewport cuando el documento es pequeño (centrado), pero crece más allá cuando el documento escalado es grande (activando scroll). `overflow-hidden` en la tarjeta evita que su tamaño crezca — el scroll vive solo en `bodyRef`.

