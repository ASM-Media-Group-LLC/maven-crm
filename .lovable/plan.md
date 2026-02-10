

# Hover con fondo de color en KPI cards

## Problema actual

Las cards usan `hover:shadow-[...]` que solo agrega una sombra exterior. Las imagenes de referencia muestran que al hacer hover, **todo el fondo de la card** se tine del color correspondiente (verde para Activas, azul para Onboarding, etc.), creando un efecto de "glow interior".

## Solucion

Reemplazar el `hoverClass` de shadow por una combinacion de:

1. **Fondo coloreado en hover**: `hover:bg-success/10` (o el color que corresponda) para que la card entera cambie su background
2. **Borde coloreado en hover**: `hover:border-success/30` para reforzar el efecto
3. **Sombra sutil**: mantener un `hover:shadow-[0_0_16px_...]` pero mas suave, como complemento

Cada card tendra estas clases de transicion: `transition-all duration-200`

## Mapeo de colores por card

| Card | hover:bg | hover:border |
|---|---|---|
| Activas | `hover:bg-success/10` | `hover:border-success/40` |
| Onboarding | `hover:bg-primary/10` | `hover:border-primary/40` |
| Pausadas | `hover:bg-warning/10` | `hover:border-warning/40` |
| Retiros | `hover:bg-destructive/10` | `hover:border-destructive/40` |
| Terminadas | `hover:bg-muted-foreground/5` | `hover:border-muted-foreground/20` |

## Archivo a modificar

`src/pages/creadores/CreadoresKPICards.tsx` -- cambiar la propiedad `hoverClass` de cada card para usar `hover:bg-*` + `hover:border-*` en lugar de solo `hover:shadow-*`. Cambiar `transition-shadow` por `transition-all`.

