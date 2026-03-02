

## Plan: Mejorar el Landing Page de Maven

El landing actual tiene una estructura básica (hero, 6 módulos, 4 stats, CTA, footer). Vamos a enriquecerlo significativamente con más secciones y contenido que refleje todo lo que la plataforma ofrece.

### Nuevas secciones y mejoras

**1. Navbar** — Agregar más links: "Funcionalidades", "Módulos", "Beneficios", "Métricas"

**2. Hero mejorado** — Subtítulo más descriptivo + lista de bullets rápidos con iconos (ej: "Gestión de creadores", "Sales tracking", "HR completo", "Messenger interno")

**3. Módulos expandidos (de 6 a 10+)** — Agregar los módulos que faltan:
- HR & Recursos Humanos (onboarding, nómina, vacaciones, monitoreo)
- Finanzas (facturación, comisiones, nómina, reportes)
- Messenger interno (chat, videollamadas, archivos compartidos)
- Tareas & Proyectos (kanban, subtareas, compartir proyectos)
- Tickets (soporte interno, seguimiento)
- AI Sales (chat IA para ventas)

**4. Nueva sección: "Cómo funciona"** — 3 pasos visuales:
1. Registra tu agencia
2. Configura tus módulos
3. Escala tus operaciones

**5. Nueva sección: "Beneficios clave"** — Grid de 4 beneficios con iconos:
- Todo centralizado
- Automatización inteligente
- Reportes en tiempo real
- Seguridad y control de roles

**6. Nueva sección: "Trusted by" / Social proof** — Texto de confianza con logos/badges genéricos

**7. Stats mejorados** — Agregar más métricas relevantes

**8. FAQ section** — 4-5 preguntas frecuentes con acordeón

**9. Footer mejorado** — Columnas con links organizados por categoría

### Archivo modificado
- `src/pages/Landing.tsx` — reescritura completa con todas las secciones nuevas

### Diseño visual
Se mantiene el mismo lenguaje visual: fondo oscuro `hsl(240,10%,2%)`, glass cards, gradientes animados, tipografía white/60 para texto secundario, componentes existentes (`Badge`, `Button`, `AnimatedGradientBackground`, `AnimatedWaves`). Se usa el `Accordion` de Radix para el FAQ.

