

## 1. Espacio superior en la seccion de modulos

Agregar `pt-20` a la seccion `#funcionalidades` (linea 125) para crear separacion visual respecto al hero. Actualmente solo tiene `pb-20` y el titulo queda pegado al fondo del hero.

## 2. Animaciones adicionales en el Hero

El hero ya tiene `animate-fade-in-up` con delays escalonados, pero se puede enriquecer:

- Agregar una animacion de pulso sutil a la linea gradiente decorativa (linea 112): `animate-pulse` con opacidad reducida
- Agregar hover animado a los botones CTA: `transition-all duration-300 hover:scale-105` y un efecto glow sutil en el boton principal
- Agregar `animate-float` al Badge del hero para darle movimiento continuo sutil

## 3. Mejora del Footer

Transformar el footer minimalista actual en una version mas rica y dinamica:

- Agregar navegacion interna con links a secciones (Funcionalidades, Metricas) y links de auth (Iniciar sesion, Registrarse)
- Agregar un CTA final tipo "call to action" antes del footer: una seccion con glass-card, titulo motivacional y boton de registro
- Agregar `AnimatedGradientBackground` al footer para continuidad visual con el hero
- Agregar iconos decorativos con `animate-float` y texto de copyright con el ano actual
- La linea divisoria gradiente se mantiene

### Estructura del nuevo footer:

```text
--- CTA Section (glass-card con fondo animado) ---
"Listo para escalar tu agencia?"
Subtitulo + boton [Comenzar ahora]

--- Footer ---
Logo + tagline oficial
Links de navegacion (Funcionalidades | Metricas | Iniciar sesion)
Linea gradiente
"2026 Clari. Todos los derechos reservados."
```

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/Landing.tsx` | Agregar pt-20 a seccion modulos; agregar animaciones al hero (float en badge, pulse en linea, hover en CTAs); redisenar footer con CTA section, navegacion y fondo animado |

## Detalle tecnico

- Se usan las animaciones ya existentes: `animate-fade-in-up`, `animate-float`, `animate-pulse`
- Se reutiliza `AnimatedGradientBackground` para el CTA section del footer
- Se usan `glass-card` y `glass-card-subtle` ya definidos en el CSS
- Los hover effects usan clases de Tailwind sin valores hardcoded
- Los links de navegacion del footer usan `story-link` para la animacion de underline

