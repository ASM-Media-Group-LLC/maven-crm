

## Formas ondulantes animadas para el fondo Auth

### Objetivo
Agregar curvas/ondas SVG animadas con efecto de flujo que se muevan sutilmente por el fondo, creando una sensacion premium y tech. Inspirado en la referencia de ondas fluidas con particulas, pero adaptado a la paleta azul-violeta existente.

### Nuevo componente: `src/components/auth/AnimatedWaves.tsx`

Crear un componente con 2-3 curvas SVG tipo onda que se animan con movimiento lento y continuo. Cada onda tendra:
- Path SVG con curvas bezier suaves
- Gradiente lineal azul-violeta con opacidad baja
- Animacion CSS de desplazamiento horizontal lento (30-40s por ciclo)
- Efecto de brillo sutil en los bordes (stroke con gradiente semi-transparente)

Estructura de cada onda:
```text
SVG fullscreen (viewBox responsive)
  defs: linearGradient azul-violeta
  path: curva bezier con fill gradiente (opacity 0.06-0.12)
  path: misma curva con stroke gradiente para borde luminoso (opacity 0.15-0.25)
```

Animaciones (3 ondas con distintos timings):
- Onda 1: movimiento horizontal + vertical sutil, 35s ciclo
- Onda 2: movimiento inverso, 28s ciclo  
- Onda 3: mas pequena y rapida, 22s ciclo

### Keyframes en `src/index.css`

Agregar 3 nuevos keyframes para el movimiento ondulante:
```text
wave-drift-1: translateX(-5%) a translateX(5%) con rotacion sutil
wave-drift-2: translateX(5%) a translateX(-5%) (inverso)
wave-drift-3: translateY(-3%) a translateY(3%) con escala sutil
```

### Integracion en `src/components/auth/AuthLayout.tsx`

Importar y agregar `AnimatedWaves` despues de `AnimatedGradientBackground`, antes del contenido z-10. Las ondas estaran en z-[1] para quedar entre los blobs difusos y el contenido.

### Detalle tecnico de las ondas

Las formas SVG seran curvas bezier amplias que cruzan la pantalla diagonalmente, simulando ondas de flujo. Cada una tendra:
- `fill` con gradiente de `hsl(271,91%,50%)` a `hsl(211,100%,50%)` a muy baja opacidad (0.06-0.12)
- `stroke` con gradiente similar pero mas brillante (0.2-0.3) y stroke-width fino (1-1.5px) para simular el efecto de borde luminoso de la referencia
- `filter: blur(1px)` en el fill para suavizar bordes

### Archivos a modificar/crear

| Archivo | Accion |
|---------|--------|
| `src/components/auth/AnimatedWaves.tsx` | Crear - componente con 3 ondas SVG animadas |
| `src/index.css` | Agregar 3 keyframes de wave-drift |
| `src/components/auth/AuthLayout.tsx` | Importar y renderizar AnimatedWaves |

### Resultado esperado
Fondo negro con blobs difusos azul-violeta (existentes) + ondas fluidas sutiles con bordes luminosos que se mueven lentamente, creando profundidad y una estetica premium/tech sin sobrecargar visualmente.

