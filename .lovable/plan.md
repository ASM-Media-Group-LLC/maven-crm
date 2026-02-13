

## Agregar hover a las tarjetas del Board de LeadGen

### Cambio

**Archivo**: `src/pages/leadgen/LeadGenGrid.tsx` (linea 74)

Actualizar la clase de la Card para reemplazar `hover:shadow-md` por un hover basado en cambio de background, siguiendo las reglas del sistema de diseno (prohibido usar sombras como indicador de hover):

```tsx
// De:
className="cursor-pointer hover:shadow-md transition-shadow relative"

// A:
className="cursor-pointer hover:bg-muted/50 transition-colors relative"
```

Esto aplica un fondo sutil `muted/50` al pasar el cursor, consistente con el patron `hover:bg-accent` definido en la seccion 1.7 de estados globales del design system, usando `transition-colors` en lugar de `transition-shadow`.

