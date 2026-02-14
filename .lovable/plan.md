

## Dos cambios: eliminar particulas + definir boton primary con gradiente

### 1. Eliminar particulas del auth

Remover el componente `ParticlesBackground` del `AuthLayout.tsx` para que solo queden los blobs de gradiente animado moviéndose suavemente, más fiel a la imagen de referencia. Los blobs actuales ya tienen buena cobertura de color; sin las particulas el efecto será más limpio y enfocado.

Tambien se ajustarán los blobs para que la composición sea más similar a la referencia:
- Blob rojo más grande y saturado (opacity 0.5)
- Blob azul más prominente y centrado (opacity 0.45)
- Blob purple más sutil como transición
- Rosa más difuminado

### 2. Boton primary con gradiente azul-violeta

Actualizar la variante `default` del botón para usar un gradiente consistente con el branding del logo Maven (from-accent to-primary). Esto unifica la identidad visual y resuelve la ambiguedad actual.

El hover oscurecerá ligeramente el gradiente con un overlay.

### Cambios por archivo

| Archivo | Cambio |
|---------|--------|
| `src/components/auth/AuthLayout.tsx` | Eliminar import y uso de `ParticlesBackground` |
| `src/components/auth/AnimatedGradientBackground.tsx` | Ajustar opacidades y tamaños de los blobs para mayor intensidad |
| `src/components/ui/button.tsx` | Variante `default`: cambiar de `bg-primary` a gradiente `bg-gradient-to-r from-accent to-primary` con hover via `hover:opacity-90` |
| `src/index.css` | Eliminar los keyframes `twinkle` y `float-particle` (ya no se usan) |

### Detalle del boton

```text
Antes:  "bg-primary text-primary-foreground hover:bg-primary/90"
Despues: "bg-gradient-to-r from-accent to-primary text-primary-foreground hover:opacity-90"
```

Esto aplica automaticamente a todos los botones `default` en la plataforma (formularios de auth, modales, etc.), manteniendo coherencia con el gradiente del logo Maven.

### Nota sobre el outline button

El boton `outline` actualmente usa `hover:bg-accent hover:text-accent-foreground` (violeta en hover). Esto se mantiene sin cambios ya que es correcto para acciones secundarias en headers de pagina, segun las reglas de uso contextual documentadas.
