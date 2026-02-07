

# Mejorar y Completar el Design System

## Resumen

Reestructurar la pagina `/design-system` existente para convertirla en una referencia completa, navegable y documentada de todos los tokens de diseno y componentes UI del proyecto. No se crean colores nuevos, no se modifican componentes existentes, no se cambian layouts ni flujos.

## Que cambia

### Navegacion interna

La pagina actual es un scroll largo sin forma de navegar. Se agregara una barra lateral fija (solo dentro de esta pagina) con enlaces ancla a cada seccion y subseccion, permitiendo saltar rapidamente entre Foundations y Components.

### Seccion 1: FOUNDATIONS (Estilos base)

Se reorganizan y expanden las secciones actuales de la pagina:

**1.1 Colores** (ya existe parcialmente, se completa)
- Reorganizar en grupos semanticos: Brand (primary, accent), Neutrales (background, foreground, card, muted, border), Estados (success, warning, destructive, info), Instagram
- Agregar documentacion de opacidades estandar usadas en el sistema (ejemplo: `/80` para hover, `/50` para disabled, `/15` para soft backgrounds)
- Documentar reglas de uso para cada color
- Nota sobre modo light/dark: actualmente el sistema usa un unico tema oscuro como base

**1.2 Tipografia** (ya existe parcialmente, se completa)
- Agregar jerarquia semantica: mapear los tamanos a roles (H1=5xl, H2=3xl, H3=2xl, H4=xl, body=base, caption=sm, label=sm+medium)
- Documentar line-height y letter-spacing por nivel
- Indicar familia tipografica del sistema
- Documentar casos de uso recomendados por nivel

**1.3 Espaciado** (ya existe, se mejora)
- Agregar nombres semanticos (xs=1/4px, sm=2/8px, md=4/16px, lg=6-8/24-32px, xl=12-16/48-64px)
- Documentar cuando usar cada rango
- Nota sobre prohibicion de valores fuera de escala

**1.4 Bordes y Radius** (ya existe, se mejora)
- Agregar casos de uso documentados (sm para inputs, lg para cards, full para avatars/badges)
- Regla de no mezclar radios sin justificacion

**1.5 Sombras** (ya existe, se mejora)
- Agregar sombras de estado: hover y focus (documentar que se usan ring para focus)
- Documentar uso permitido vs no permitido

**1.6 Z-Index** (nueva seccion)
- Documentar la escala actual del proyecto extraida de los componentes:
  - Base content: `auto/0`
  - Dropdown/Select/Popover: `z-50`
  - Dialog overlay: `z-50`
  - Toast viewport: `z-[100]`
- Regla: prohibido usar valores arbitrarios fuera de esta escala

**1.7 Estados Globales** (nueva seccion)
- Hover: documentar patron `hover:bg-{color}/90` para botones, `hover:bg-accent` para menus
- Focus: documentar patron `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
- Disabled: documentar patron `disabled:pointer-events-none disabled:opacity-50`
- Loading: documentar uso del componente Skeleton existente con `animate-pulse`
- Active: documentar `data-[state=selected]` y patrones active

### Seccion 2: COMPONENTS

Se agregan showcases de los componentes UI ya existentes en el proyecto. No se crean componentes nuevos, solo se documentan los que ya estan en `src/components/ui/`.

**2.1 Botones** (ya existe parcialmente, se completa)
- Mostrar todas las variantes con su caso de uso documentado (Primary=accion principal, Secondary/Ghost=acciones secundarias, Destructive=eliminar, Outline=neutro, Link=navegacion)
- Agregar estado disabled y un ejemplo de loading con icono Loader2
- Reglas claras: un solo boton primary por seccion, siempre usar variante semantica

**2.2 Inputs** (nueva seccion)
- Input de texto: estado default, focus, disabled, con placeholder
- Select: trigger + opciones, estado focus, disabled
- Textarea: default, focus, disabled
- Checkbox y Switch como variantes de input booleano
- Documentar estados de error (borde destructive) y reglas

**2.3 Dropdowns** (nueva seccion)
- DropdownMenu como componente unico de dropdown
- Ejemplo funcional con items, separador, shortcut
- Documentar: comportamiento (click para abrir, click fuera para cerrar), z-index, fondo opaco

**2.4 Cards** (nueva seccion)
- Card estandar con Header, Content, Footer
- Documentar estructura base y cuando usarla
- No existe GlassCard actualmente, se documenta solo la Card existente

**2.5 Modales** (nueva seccion)
- Dialog con estructura Header/Content/Footer
- Documentar z-index (z-50), backdrop (bg-black/80), animaciones
- Ejemplo visual con boton para abrir

**2.6 Feedback** (nueva seccion)
- Alert: variantes default y destructive
- Toast: ejemplo de invocacion con useToast
- Skeleton: patron de loading/empty state
- Documentar cuando usar cada tipo

**2.7 Data Display** (nueva seccion)
- Table: ejemplo con header, rows, footer
- Badges: todas las variantes ya existentes organizadas por categoria (solid, soft, outline)
- Tooltip: ejemplo funcional
- Progress: barra de progreso

## Estructura de archivos

Para mantener el codigo organizado sin crear un archivo monolitico de 1500+ lineas, se crearan componentes de seccion exclusivos de la pagina del design system:

```text
src/pages/design-system/
  DesignSystemPage.tsx        -- Layout principal con sidebar de navegacion
  sections/
    ColorsSection.tsx         -- 1.1 Colores
    TypographySection.tsx     -- 1.2 Tipografia  
    SpacingSection.tsx        -- 1.3 Espaciado
    BordersSection.tsx        -- 1.4 Bordes y Radius
    ShadowsSection.tsx        -- 1.5 Sombras
    ZIndexSection.tsx         -- 1.6 Z-Index
    GlobalStatesSection.tsx   -- 1.7 Estados Globales
    ButtonsSection.tsx        -- 2.1 Botones
    InputsSection.tsx         -- 2.2 Inputs
    DropdownsSection.tsx      -- 2.3 Dropdowns
    CardsSection.tsx          -- 2.4 Cards
    ModalsSection.tsx         -- 2.5 Modales
    FeedbackSection.tsx       -- 2.6 Feedback
    DataDisplaySection.tsx    -- 2.7 Data Display
```

**Archivos a modificar:**
- `src/pages/DesignSystem.tsx` -- Se redirige al nuevo componente
- `src/App.tsx` -- Sin cambios, la ruta `/design-system` ya existe

**Archivos a crear:**
- Todos los listados arriba en `src/pages/design-system/`

**Sin dependencias nuevas.** Todo se construye con los componentes UI existentes (Card, Badge, Button, Input, Select, Textarea, Dialog, Alert, Table, DropdownMenu, Tooltip, Checkbox, Switch, Progress, Skeleton, Label) y clases de Tailwind.

**Sin cambios a componentes UI.** Los archivos en `src/components/ui/` no se tocan. Solo se documentan y muestran.

**Sin nuevos colores ni tokens.** Se usan exclusivamente los tokens ya definidos en `index.css` y `tailwind.config.ts`.

## Detalles tecnicos

**Navegacion interna:** Se implementara con IDs en cada seccion y scroll suave (`scroll-behavior: smooth`). La sidebar usara `position: sticky` con `top` para mantenerse visible durante el scroll.

**Componentes interactivos:** Los ejemplos de Modal y Dropdown seran funcionales (se pueden abrir/cerrar) usando los componentes Radix existentes con estado local via `useState`.

**Documentacion inline:** Cada seccion incluira un bloque de texto con reglas de uso, tokens permitidos y restricciones, usando las clases `text-muted-foreground text-sm` para mantener consistencia visual.

