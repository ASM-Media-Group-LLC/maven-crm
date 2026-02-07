

# Soporte Light/Dark Mode en el Design System

## Resumen

Agregar un tema claro (light mode) al sistema de tokens CSS y un toggle de tema en la pagina del Design System para poder previsualizar todos los componentes y tokens en ambos modos. El resto de la aplicacion mantendra el tema oscuro como default.

---

## Cambios detallados

### 1. Actualizar tokens CSS (`src/index.css`)

Actualmente todos los tokens estan definidos en `:root` con valores oscuros. Se reorganizara:

- **`:root`** (light mode por defecto): Definir valores claros para todos los tokens existentes
  - background: blanco/gris muy claro
  - foreground: gris oscuro/negro
  - card: blanco
  - muted: gris claro
  - border: gris medio
  - Los colores de marca (primary, accent, destructive, success, warning, instagram) se mantienen identicos en ambos modos
  - Los foregrounds de colores de marca se ajustan para contraste en fondo claro

- **`.dark`**: Mover los valores actuales (oscuros) a este selector
  - Todos los valores actuales de `:root` se mueven intactos aqui
  - Esto funciona con `darkMode: ["class"]` de Tailwind

No se crean colores nuevos. Solo se definen valores alternativos (claros) para los tokens semanticos existentes.

### 2. Configurar ThemeProvider (`src/App.tsx`)

Envolver la aplicacion con `ThemeProvider` de `next-themes` (ya instalado):
- `attribute="class"` (coincide con Tailwind `darkMode: ["class"]`)
- `defaultTheme="dark"` (mantener el tema oscuro como default para la app)
- `enableSystem={false}` (no usar preferencia del sistema, controlar manualmente)

### 3. Agregar toggle de tema al Design System (`src/pages/design-system/DesignSystemPage.tsx`)

Agregar un boton de toggle en el header de la sidebar y en el header principal del contenido:
- Icono `Sun` / `Moon` de lucide-react
- Usa `useTheme()` de `next-themes` para cambiar entre "light" y "dark"
- Label que indica el modo actual ("Light" / "Dark")

### 4. Actualizar ColorsSection (`src/pages/design-system/sections/ColorsSection.tsx`)

El problema actual: los swatches de color usan valores HSL hardcodeados en `style={{ backgroundColor }}`. En su lugar:

- Cambiar los swatches para usar clases de Tailwind que referencian los tokens (ej: `bg-primary`, `bg-background`), de forma que cambien automaticamente con el tema
- Mantener la tabla de valores HSL pero ahora mostrar los valores de ambos modos en la documentacion
- La seccion de opacidades no cambia (los porcentajes son los mismos)

### 5. Actualizar descripcion en la pagina

- Cambiar el texto "Tema oscuro" por "Light / Dark mode" en el header de la pagina
- Actualizar la nota en ColorsSection de "unico tema oscuro" a "soporte light y dark mode"
- Actualizar la nota en ShadowsSection que dice "En tema oscuro las sombras tienen menor impacto visual"

---

## Valores del tema Light

Los tokens light se definen invirtiendo la luminosidad de los neutrales mientras se mantienen los colores de marca:

| Token | Dark (actual) | Light (nuevo) |
|---|---|---|
| background | 240 8% 10% | 0 0% 100% |
| foreground | 240 5% 96% | 240 10% 4% |
| card | 240 6% 13% | 0 0% 100% |
| card-foreground | 240 5% 96% | 240 10% 4% |
| popover | 240 6% 13% | 0 0% 100% |
| popover-foreground | 240 5% 96% | 240 10% 4% |
| muted | 240 6% 15% | 240 5% 96% |
| muted-foreground | 240 5% 65% | 240 4% 46% |
| secondary | 240 6% 15% | 240 5% 96% |
| secondary-foreground | 240 5% 96% | 240 6% 10% |
| border | 240 6% 18% | 240 6% 90% |
| input | 240 6% 18% | 240 6% 90% |
| primary | 211 100% 50% | 211 100% 50% (igual) |
| accent | 271 91% 50% | 271 91% 50% (igual) |
| destructive | 0 84% 60% | 0 84% 60% (igual) |
| success | 145 63% 32% | 145 63% 32% (igual) |
| warning | 40 96% 40% | 40 96% 40% (igual) |
| ring | 211 100% 50% | 211 100% 50% (igual) |
| sidebar-background | 240 8% 10% | 0 0% 98% |
| sidebar-border | 240 6% 12% | 240 6% 90% |

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/index.css` | Reorganizar tokens: light en `:root`, dark en `.dark` |
| `src/App.tsx` | Envolver con `ThemeProvider` de `next-themes` |
| `src/pages/design-system/DesignSystemPage.tsx` | Agregar toggle light/dark con icono Sun/Moon |
| `src/pages/design-system/sections/ColorsSection.tsx` | Usar clases Tailwind en vez de HSL hardcodeado para swatches; documentar ambos modos |
| `src/pages/design-system/sections/ShadowsSection.tsx` | Actualizar texto descriptivo sobre sombras en temas |

## Archivos sin cambios

Ningun componente en `src/components/ui/` se modifica. Todos ya usan tokens semanticos (`bg-background`, `text-foreground`, etc.) que se adaptan automaticamente al cambiar la clase `.dark` en el HTML.

## Sin dependencias nuevas

`next-themes` ya esta instalado en el proyecto.

