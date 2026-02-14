

## Organizar el Design System en 5 secciones navegables

### Situacion actual
Todas las 18 sub-secciones se renderizan en una sola pagina scrollable con una barra horizontal plana. El usuario quiere 5 secciones principales claramente diferenciadas.

### Solucion
Convertir las 5 categorias en tabs principales usando el patron estandar de tab navigation de la plataforma (`inline-flex` con `bg-muted/50`). Cada tab muestra unicamente las sub-secciones que le corresponden.

### Las 5 secciones

| Tab | Contenido |
|-----|-----------|
| Design Foundations | Colores, Tipografia, Espaciado, Bordes, Sombras, Z-Index, Estados |
| Component Library | Botones, Inputs, Dropdowns, Cards, Modales, Feedback, Data Display |
| Layout & Patterns | Page Layouts, Composicion |
| Icons & Logos | Iconografia, Avatares |
| Docs & Accessibility | Docs & a11y |

### Cambios tecnicos

**Archivo: `src/pages/design-system/DesignSystemPage.tsx`**

1. Reemplazar el estado `activeId` (scroll-based) por un estado `activeTab` con valores: `"foundations"`, `"components"`, `"layout"`, `"icons"`, `"docs"`
2. Eliminar el `IntersectionObserver` y la logica de `scrollTo` (ya no se necesita scroll entre secciones de distintas categorias)
3. En la barra horizontal, reemplazar los botones individuales por 5 botones de tab (uno por seccion) usando el patron estandar: contenedor `inline-flex rounded-lg border bg-muted/50 p-1`, boton activo con variante `secondary`, inactivo con `ghost`
4. Renderizar condicionalmente solo las secciones del tab activo dentro del area scrollable
5. Mantener el header y ThemeToggle sin cambios

Estructura visual:

```text
+--------------------------------------------------------+
| Header: "Design System"  [v1.0.0]      [Light/Dark]   |
| Referencia completa de tokens...                       |
+--------------------------------------------------------+
| [Design Foundations] [Component Library] [Layout & P.] |
| [Icons & Logos] [Docs & Accessibility]                 |
+--------------------------------------------------------+
|                                                        |
|  (solo las secciones del tab activo)                   |
|                                                        |
+--------------------------------------------------------+
```

| Archivo | Cambio |
|---------|--------|
| `src/pages/design-system/DesignSystemPage.tsx` | Reemplazar navegacion scroll por tabs con renderizado condicional por seccion |

