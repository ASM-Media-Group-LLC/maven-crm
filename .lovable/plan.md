

## Gradiente animado en el panel izquierdo del Auth

### Concepto

Reemplazar el fondo estatico del panel izquierdo por un gradiente animado que se desplaza suavemente, inspirado en la imagen de referencia. Los colores usados seran del design system: `accent` (purple 271 91% 50%), `primary` (blue 211 100% 50%), y `destructive` (red 0 84% 60%), sobre un fondo oscuro.

### Cambios

#### 1. Nuevo componente: `AnimatedGradientBackground.tsx`

Crear `src/components/auth/AnimatedGradientBackground.tsx` que renderiza multiples "blobs" de color con posicion absoluta y una animacion CSS que los desplaza lentamente. Cada blob es un `div` grande con `border-radius: 50%`, `filter: blur(80-120px)`, y una animacion `@keyframes` que mueve su posicion (`translate`) en un ciclo suave de 10-15 segundos.

Blobs propuestos:
- Blob 1 (rojo/destructive): esquina superior izquierda, grande
- Blob 2 (azul/primary): centro-inferior, mediano
- Blob 3 (purple/accent): centro, mediano
- Blob 4 (rosa claro): entre rojo y azul, sutil

Cada blob tiene su propia animacion con diferentes duraciones y trayectorias para crear un efecto organico.

#### 2. Keyframes en `index.css`

Agregar keyframes `blob-move-1`, `blob-move-2`, `blob-move-3`, `blob-move-4` que desplazan cada blob en trayectorias diferentes usando `translate` y `scale`. Duraciones entre 8s y 15s, `infinite alternate ease-in-out`.

#### 3. Actualizar `AuthLayout.tsx`

- Reemplazar el `bg-gradient-to-br from-[...] via-[...] to-[...]` estatico por un fondo oscuro solido (`bg-[hsl(240,8%,6%)]`)
- Reemplazar `<ParticlesBackground />` por `<AnimatedGradientBackground />`
- Mantener las particulas como capa superior (opcional, encima del gradiente) para conservar profundidad

#### 4. Mantener `ParticlesBackground.tsx` sin cambios

Las particulas se mantienen como capa adicional sobre el gradiente animado para dar textura.

### Estructura visual

```text
Panel izquierdo:
  [bg oscuro solido hsl(240,8%,6%)]
    [AnimatedGradientBackground]
      Blob rojo (top-left, blur 100px, animacion lenta)
      Blob azul (center-bottom, blur 120px, animacion media)
      Blob purple (center, blur 80px, animacion lenta)
      Blob rosa (transicion, blur 100px, animacion media)
    [ParticlesBackground - particulas blancas encima]
    [Logo + texto centrado - z-10]
```

### Archivos

| Archivo | Cambio |
|---------|--------|
| `src/components/auth/AnimatedGradientBackground.tsx` | Nuevo - blobs de color con animacion CSS |
| `src/components/auth/AuthLayout.tsx` | Reemplazar fondo estatico por fondo oscuro + AnimatedGradientBackground + ParticlesBackground |
| `src/index.css` | Agregar keyframes blob-move-1 a blob-move-4 |

### Colores (del design system)

- Rojo: `hsl(0, 84%, 60%)` - destructive
- Azul: `hsl(211, 100%, 50%)` - primary
- Purple: `hsl(271, 91%, 50%)` - accent
- Rosa: `hsl(340, 82%, 59%)` - instagram-pink (ya en el sistema)
- Fondo: `hsl(240, 8%, 6%)` - version mas oscura del background dark
