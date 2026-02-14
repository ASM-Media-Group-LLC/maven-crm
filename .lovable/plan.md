

## Ajuste de colores del gradiente auth

### Problema
El blob rojo (destructive) y el rosa no encajan con la estetica moderna oscura. El fondo necesita ser mas oscuro con subtonos exclusivamente azules y violetas.

### Cambios

#### `src/components/auth/AnimatedGradientBackground.tsx`

Reemplazar los colores de los 5 blobs:

| Blob | Antes | Despues |
|------|-------|---------|
| Blob 1 | Rojo `hsl(0, 84%, 60%)` opacity 0.5 | Azul profundo `hsl(211, 100%, 50%)` opacity 0.4 |
| Blob 2 | Azul `hsl(211, 100%, 50%)` opacity 0.45 | Violeta `hsl(271, 91%, 50%)` opacity 0.35 |
| Blob 3 | Purple `hsl(271, 91%, 50%)` opacity 0.35 | Azul oscuro `hsl(220, 80%, 40%)` opacity 0.4 |
| Blob 4 | Rosa `hsl(340, 82%, 59%)` opacity 0.3 | Violeta profundo `hsl(260, 70%, 35%)` opacity 0.3 |
| Blob 5 | Naranja `hsl(25, 95%, 53%)` opacity 0.2 | Indigo sutil `hsl(240, 60%, 45%)` opacity 0.25 |

#### `src/components/auth/AuthLayout.tsx`

Oscurecer el fondo base de `hsl(240,8%,6%)` a `hsl(240,10%,4%)` para mayor contraste y profundidad.

### Resultado
Paleta exclusivamente azul-violeta-indigo sobre fondo casi negro, consistente con primary y accent del design system, sin rojos ni naranjas.

