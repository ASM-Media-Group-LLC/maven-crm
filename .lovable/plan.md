

## Hacer el hover de las tarjetas visible

### Problema

El componente `Card` base aplica `bg-card` como fondo solido. Al agregar `hover:bg-muted/50`, el cambio de color es practicamente imperceptible porque `muted` con 50% de opacidad se mezcla de forma muy similar al fondo de la card.

### Solucion

**Archivo**: `src/pages/leadgen/LeadGenGrid.tsx` (linea 76)

Cambiar el hover para usar un efecto combinado mas visible: borde con color primario y un fondo muted sin transparencia.

```tsx
// De:
className="cursor-pointer hover:bg-muted/50 transition-colors relative"

// A:
className="cursor-pointer hover:bg-muted/50 hover:border-primary/30 transition-all relative"
```

Esto agrega `hover:border-primary/30` que cambia el borde de la tarjeta a un tono sutil del color primario, haciendolo claramente visible. Se usa `transition-all` para animar tanto el fondo como el borde. Este patron ya se usa en las tarjetas del grid de Eventos (`EventosGrid.tsx` linea 70: `hover:shadow-md hover:border-primary/30`).

### Resultado

Al pasar el cursor sobre la tarjeta, el borde se tornara al color primario con 30% de opacidad, dando un feedback visual claro e inmediato.

