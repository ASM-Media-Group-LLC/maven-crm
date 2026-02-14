

## 1. Footer: Agregar tagline oficial debajo del logo

En el footer del Landing, debajo de `<Logo size="sm" />`, reemplazar el texto actual ("La plataforma CRM para agencias de creadores de contenido.") por el tagline oficial usado en la pantalla de inicio de sesion:

**"La plataforma integral para gestionar, escalar y optimizar tus operaciones."**

Mismo estilo: `text-sm text-muted-foreground`.

## 2. Hero: Fondo dinamico con animated blobs y waves

Reemplazar el actual `hero-gradient` (un simple radial-gradient estatico) por los mismos componentes animados del auth:

- Agregar `AnimatedGradientBackground` (blobs fluidos animados)
- Agregar `AnimatedWaves` (ondas SVG con bordes luminosos)
- Cambiar el fondo base del hero a `bg-[hsl(240,10%,2%)]` (negro profundo, igual que auth)
- Asegurar que el contenido del hero tenga `relative z-10` para estar sobre las animaciones

## 3. Modulos: Cards con efecto glass

Reemplazar las cards actuales de modulos (border + bg-card) por el patron `glass-card-subtle`:

- Aplicar `glass-card-subtle` como clase base
- Agregar hover animado: `transition-all duration-300 hover:scale-[1.02]` con cambio de borde a `hover:border-white/15`
- Cambiar texto a colores claros (`text-white`, `text-white/60`) ya que el fondo sera oscuro

## 4. Stats: Fondo con glass effect

La seccion de metricas actualmente usa `bg-card`. Cambiar a un fondo sutil con glass:

- Fondo: quitar `bg-card border-t` y usar un gradiente sutil con blur
- Cada stat card: envolver en un contenedor con `glass-card-subtle` y padding
- Mantener las animaciones float existentes

## 5. Navbar: Adaptar al fondo oscuro del hero

- Cambiar `bg-background/80` a `bg-[hsl(240,10%,2%)]/80` para que se integre con el fondo oscuro
- Agregar `backdrop-blur-xl` para mejor efecto de profundidad
- Borde: cambiar `border-border` a `border-white/[0.06]`

## 6. Footer: Estilo oscuro coherente

- Fondo oscuro `bg-[hsl(240,10%,2%)]`
- Linea divisoria: gradiente con `via-white/10` en lugar de `via-border`
- Texto en `text-white/60`

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/Landing.tsx` | Importar AnimatedGradientBackground y AnimatedWaves; redisenar hero, cards, stats, navbar y footer con glass effects y fondo oscuro; actualizar tagline del footer |

Solo se modifica un archivo. Los componentes de animacion (`AnimatedGradientBackground`, `AnimatedWaves`) y las utilidades CSS (`glass-card`, `glass-card-subtle`) ya existen y se reutilizan directamente.

## Detalle visual del resultado

```text
Navbar:  fondo oscuro blur, borde sutil blanco/6%
Hero:    fondo negro con blobs animados + waves, badge glass, logo, tagline, CTAs
Modulos: cards glass-card-subtle con hover scale, iconos con color, fondo oscuro continuo
Stats:   cards glass individuales, iconos flotantes, fondo oscuro
Footer:  logo + tagline oficial, fondo oscuro, linea gradiente sutil
```

Todo el landing se convierte en una experiencia visual oscura e inmersiva, coherente con la pantalla de autenticacion, usando los mismos efectos de glass y animaciones que ya estan definidos en el sistema de diseno.
