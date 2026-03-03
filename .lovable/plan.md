

## Plan: Igualar alturas de cards en todas las secciones

El problema es que el componente `ScrollReveal` no tiene `h-full` en varias secciones, lo que rompe el estiramiento natural del grid. Las cards internas tampoco tienen `h-full`.

### Cambios

**1. `src/pages/landing/LandingModules.tsx` (linea 128-147)**
- Agregar `className="h-full"` al `ScrollReveal`
- Agregar `h-full` al div interno de la card

**2. `src/pages/landing/LandingBenefits.tsx` (linea 40-50)**
- Agregar `className="h-full"` al `ScrollReveal`
- Agregar `h-full` al div interno de la card

**3. `src/pages/landing/LandingStats.tsx` (linea 59-65)**
- Agregar `className="h-full"` al `ScrollReveal`
- Agregar `h-full` al div interno de la card

Esto fuerza a que cada wrapper y card ocupe el 100% de la celda del grid, igualando todas las alturas por fila.

