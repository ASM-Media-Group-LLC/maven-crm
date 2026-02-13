

## Limitar el ancho del dropdown de Creador/a al mismo tamaño del input

### Problema
El dropdown del Select de "Creador/a" se expande mas alla del ancho del trigger porque los nombres de los creadores son largos. Radix usa `min-w-[var(--radix-select-trigger-width)]` pero no limita el ancho maximo, asi que el contenido empuja el popover.

### Solucion
En el archivo `src/components/ui/select.tsx`, agregar `max-w-[var(--radix-select-trigger-width)]` al Viewport del SelectContent (linea 82) para que el dropdown nunca sea mas ancho que el trigger. Los textos largos se cortaran con overflow hidden automaticamente.

### Detalle tecnico

**Archivo:** `src/components/ui/select.tsx`

**Cambio en linea 82:**

Cambiar:
```
"h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
```

Por:
```
"h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)]"
```

Esto fuerza al viewport del dropdown a nunca exceder el ancho del trigger. Los items con texto largo se truncaran visualmente dentro del espacio disponible.

