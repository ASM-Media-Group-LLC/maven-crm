

## Plan: Hacer el Landing mas dinamico y premium

El problema actual es que las animaciones `animate-fade-in-up` se ejecutan solo al cargar la pagina (CSS puro), por lo que si el usuario hace scroll, las secciones ya estan visibles sin animacion. Ademas faltan efectos interactivos y visuales que den sensacion premium.

### Cambios propuestos

**1. Crear hook `useScrollReveal` (nuevo archivo `src/hooks/useScrollReveal.ts`)**
- Hook basado en `IntersectionObserver` que detecta cuando un elemento entra al viewport
- Retorna un `ref` y un booleano `isVisible`
- Permite animaciones on-scroll en lugar de solo al cargar

**2. Crear componente `ScrollReveal` (nuevo archivo `src/components/landing/ScrollReveal.tsx`)**
- Wrapper reutilizable que aplica animaciones al entrar en viewport
- Props: `delay`, `direction` (up, left, right, scale), `className`
- Usa el hook internamente, aplica clases de transicion CSS (opacity, transform)

**3. Actualizar `src/index.css`**
- Agregar nuevas animaciones CSS:
  - `glow-pulse`: sutil pulsacion de glow en bordes de cards al hover
  - `gradient-shift`: movimiento continuo de gradiente de fondo para secciones
  - `counter-up`: efecto de conteo para numeros en stats
  - `shimmer`: efecto shimmer sutil en bordes de glass-cards
- Agregar clase `.glass-card-hover-glow` con efecto de glow al hover

**4. Actualizar `Landing.tsx`**
- Envolver secciones en `ScrollReveal` para animacion al scroll
- Agregar un efecto de gradiente animado entre secciones (linea divisoria con gradiente que se mueve)

**5. Actualizar `LandingModules.tsx`**
- Reemplazar `animate-fade-in-up` estatico por `ScrollReveal` con stagger delay
- Agregar efecto de glow al hover en cada card (borde que brilla con color del modulo)
- Agregar efecto de tilt sutil con CSS `perspective` en hover

**6. Actualizar `LandingHowItWorks.tsx`**
- Agregar linea conectora animada entre los 3 pasos (linea que se "dibuja" al hacer scroll)
- Wrap en `ScrollReveal` con direccion lateral alternada

**7. Actualizar `LandingBenefits.tsx`**
- Wrap en `ScrollReveal` con stagger
- Agregar efecto de glow en icono al hover

**8. Actualizar `LandingStats.tsx`**
- Agregar efecto de "counter" animado: los numeros aparecen contando desde 0 al valor final cuando entran al viewport
- Crear componente inline `AnimatedCounter` con `useState` + `useEffect` + `requestAnimationFrame`

**9. Actualizar `LandingFAQ.tsx`**
- Wrap en `ScrollReveal`

**10. Actualizar `tailwind.config.ts`**
- Agregar keyframe `shimmer` y `glow-pulse` al theme

### Detalles tecnicos

- `IntersectionObserver` con `threshold: 0.15` y `triggerOnce: true` para que la animacion solo pase una vez
- Transiciones CSS con `transition: opacity 0.6s ease, transform 0.6s ease`
- El counter de stats usa `requestAnimationFrame` con duracion de ~1.5s, parseando el valor numerico del string
- No se agregan dependencias nuevas, todo es CSS + hooks nativos de React

