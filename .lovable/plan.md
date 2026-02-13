

## Mejorar Landing Page con animaciones y estilo moderno

### Cambios en Tailwind Config (`tailwind.config.ts`)

Agregar keyframes para las animaciones de la landing:

- **fade-in-up**: Elementos aparecen desde abajo con fade (para hero, cards, stats)
- **float**: Movimiento sutil flotante para los iconos de modulos
- **count-up**: Efecto de escala para los numeros de metricas

### Cambios en la Landing Page (`src/pages/Landing.tsx`)

**1. Hero Section - Mas impactante**
- Agregar un gradiente radial sutil de fondo usando los tokens `accent` y `primary` con opacidad baja
- Animacion `animate-fade-in-up` escalonada: Badge aparece primero, luego Logo, subtitulo y CTAs con delays incrementales
- Agregar una linea decorativa con gradiente `from-accent to-primary` debajo del subtitulo

**2. Cards de Modulos - Interactividad mejorada**
- Transicion suave con `transition-all duration-300`
- Hover: `hover:border-primary/30` (borde sutil, sin sombras segun restricciones)
- Hover en icono: escala sutil `group-hover:scale-110` con transicion
- Animacion de entrada escalonada: cada card aparece con un delay diferente usando `style={{ animationDelay }}`
- Agregar `group` class al contenedor de cada card

**3. Seccion de Metricas - Mas dinamica**
- Animacion de entrada fade-in-up con delay escalonado por cada stat
- Icono con animacion `float` sutil y continua
- Numero con efecto de escala al aparecer

**4. Navbar - Transicion mejorada**
- Transicion suave en el backdrop blur
- Links con underline animado usando la clase `story-link` del sistema existente

**5. Footer - Toque final**
- Separador con gradiente `from-transparent via-border to-transparent` en lugar del borde solido

### Keyframes a agregar en `tailwind.config.ts`

```typescript
"fade-in-up": {
  "0%": { opacity: "0", transform: "translateY(20px)" },
  "100%": { opacity: "1", transform: "translateY(0)" }
},
"float": {
  "0%, 100%": { transform: "translateY(0)" },
  "50%": { transform: "translateY(-4px)" }
}
```

### Implementacion CSS en `src/index.css`

Agregar clase utilitaria para el fondo con gradiente radial del hero:

```css
.hero-gradient {
  background: radial-gradient(ellipse at center top, hsl(var(--accent) / 0.08) 0%, transparent 60%);
}
```

### Estructura de animaciones escalonadas

- Badge: `delay-0`
- Logo: `delay-100ms`
- Subtitulo: `delay-200ms`
- CTAs: `delay-300ms`
- Titulo de seccion: `delay-0` (al hacer scroll, aparece)
- Cards: `delay-0` a `delay-500ms` (incrementos de 100ms por card)
- Stats: `delay-0` a `delay-300ms`

### Seccion tecnica

Todas las animaciones usan `animation-fill-mode: both` via la clase `fill-mode-both` de tailwindcss-animate para que los elementos permanezcan invisibles hasta que su animacion comience. Los delays se aplican con `style={{ animationDelay: "Xms" }}` inline ya que Tailwind no soporta delays arbitrarios sin JIT values.

No se agregan dependencias nuevas. Se usan exclusivamente las animaciones CSS del sistema existente mas las nuevas keyframes en el config.

