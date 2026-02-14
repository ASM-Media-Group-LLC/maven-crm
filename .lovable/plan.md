

## Refinamiento visual del Auth: fondo negro, glass mas impactante, logo pequeno y nuevo tagline

### Cambios

#### 1. `src/components/auth/AuthLayout.tsx`
- Fondo base mas negro: cambiar de `hsl(240,10%,4%)` a `hsl(240,10%,2%)` (casi negro puro)
- Logo: cambiar de `size="lg"` a `size="sm"`
- Tagline: cambiar texto de "Gestiona tus creadores" a "La plataforma integral para gestionar, escalar y optimizar tus operaciones."
- Glass card: intensificar el efecto aumentando blur, ajustando bordes y agregando un sutil glow/shadow violeta

Glass card mejorada:
```text
Antes:  backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 shadow-2xl
Despues: backdrop-blur-2xl bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8 shadow-[0_0_80px_-20px_hsl(271,91%,50%,0.3)]
```

#### 2. `src/components/auth/AnimatedGradientBackground.tsx`
- Reducir opacidades generales (0.15 - 0.3) para que el fondo se sienta mas oscuro/negro con acentos sutiles de color
- Mantener los colores azul-violeta actuales pero mas tenues
- Ajustar posiciones para concentrar mas color en las esquinas y bordes, dejando el centro mas oscuro (donde va la card)

Nuevas opacidades:
| Blob | Color actual (mantener) | Opacidad actual | Opacidad nueva |
|------|------------------------|-----------------|----------------|
| 1 | Azul hsl(211,100%,50%) | 0.4 | 0.25 |
| 2 | Violeta hsl(271,91%,50%) | 0.35 | 0.3 |
| 3 | Azul oscuro hsl(220,80%,40%) | 0.4 | 0.2 |
| 4 | Violeta profundo hsl(260,70%,35%) | 0.3 | 0.25 |
| 5 | Indigo hsl(240,60%,45%) | 0.25 | 0.15 |

#### 3. `src/pages/Login.tsx`
- Actualizar textos de inputs para usar estilos mas oscuros y consistentes con la referencia (los inputs ya tienen bg-white/10 que es correcto)

### Archivos a modificar
- `src/components/auth/AuthLayout.tsx` - fondo, logo, tagline, glass card
- `src/components/auth/AnimatedGradientBackground.tsx` - opacidades reducidas

