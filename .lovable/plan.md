

# Reorganizar el Design System en 5 categorias

## Resumen

Redistribuir las 17 secciones existentes del Design System en 5 categorias claras, y agregar una nueva seccion de Layout & Patterns. No se elimina ni duplica contenido -- solo se reorganiza la navegacion y numeracion.

---

## Nueva estructura

```text
1. DESIGN FOUNDATIONS (styles & tokens)
   1.1 Colores
   1.2 Tipografia
   1.3 Espaciado
   1.4 Bordes
   1.5 Sombras
   1.6 Z-Index
   1.7 Estados globales

2. COMPONENT LIBRARY (reusable UI elements)
   2.1 Botones
   2.2 Inputs
   2.3 Dropdowns
   2.4 Cards
   2.5 Modales
   2.6 Feedback
   2.7 Data Display

3. LAYOUT & PATTERNS (page templates and structure)   <-- NUEVA
   3.1 Page Layouts
   3.2 Patrones de composicion

4. ICONS & BRAND ASSETS
   4.1 Iconografia    (antes 1.8)
   4.2 Avatares       (antes 1.9)

5. DOCUMENTATION & ACCESSIBILITY
   5.1 Docs & a11y    (antes 3.1)
```

---

## Que cambia y que no

### Sin cambios de contenido

Las 17 secciones existentes se mantienen identicas en su contenido interno. Solo se renumeran los titulos (ej: "1.8 Iconografia" pasa a "4.1 Iconografia") y se reubican en la sidebar.

### Archivos que se modifican

**`src/pages/design-system/DesignSystemPage.tsx`**
- Actualizar `navItems` con las 5 categorias nuevas
- Agregar import de la nueva seccion `LayoutPatternsSection`
- Reordenar los componentes en el area de contenido para que sigan la nueva estructura
- Agregar un nuevo `id="layouts"` y `id="composition"` para las secciones nuevas

**`src/pages/design-system/sections/IconsSection.tsx`**
- Cambiar titulo de "1.8 Iconografia" a "4.1 Iconografia"

**`src/pages/design-system/sections/AvatarsSection.tsx`**
- Cambiar titulo de "1.9 Avatares y Logos" a "4.2 Avatares y Logos"

**`src/pages/design-system/sections/DocumentationSection.tsx`**
- Cambiar titulo de "3.1 Documentacion y Accesibilidad" a "5.1 Documentacion y Accesibilidad"

### Archivo nuevo

**`src/pages/design-system/sections/LayoutPatternsSection.tsx`**

Seccion nueva que documenta los patrones de layout usados en el proyecto:

**3.1 Page Layouts** -- Patrones de pagina completa
- Sidebar + Content (el patron usado en esta misma pagina del Design System): sidebar fija con `sticky top-0` y area de contenido scrollable
- Centrado (`max-w-5xl mx-auto`): layout por defecto para paginas de contenido
- Fullscreen sin sidebar: paginas de login, landing, error

**3.2 Patrones de composicion** -- Patrones de estructura interna
- Stack vertical (`space-y-{n}`): el patron mas comun, bloques apilados con espaciado consistente
- Grid responsive (`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3`): para galerías, cards, dashboards
- Flex con alineacion (`flex items-center justify-between`): headers, toolbars, filas de accion
- Container con max-width: reglas de anchos maximos para legibilidad

Cada patron incluira:
- Ejemplo visual simplificado (usando divs con fondo `bg-muted` para representar areas)
- La clase Tailwind exacta a usar
- Cuando usar y cuando no

Reglas:
- Siempre usar Tailwind utilities, nunca CSS custom para layout
- Respetar los breakpoints del sistema: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px)
- No usar `position: absolute/fixed` excepto para overlays, tooltips y elementos flotantes documentados

---

## Detalle tecnico

La sidebar del Design System (`navItems`) pasara de 3 grupos a 5 grupos. El IntersectionObserver existente ya recorre automaticamente todos los IDs de `navItems.flatMap()`, por lo que el scroll-spy funcionara sin cambios adicionales.

Los nuevos IDs de seccion seran `layouts` y `composition`, usados tanto en la sidebar como en los `<section id="...">` del contenido.

No se crean dependencias nuevas. Los ejemplos de layout usan divs con clases Tailwind existentes para representar visualmente los patrones.

