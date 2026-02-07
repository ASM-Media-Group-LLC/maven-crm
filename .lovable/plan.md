

# Agregar secciones de Iconografia, Avatares, Logos, Documentacion y Accesibilidad

## Resumen

Se agregan 3 nuevas secciones al Design System existente:
- **1.8 Iconografia** (en Foundations): Documentar el sistema de iconos Lucide, tamanos permitidos, colores, y reglas de uso
- **1.9 Avatares y Logos** (en Foundations): Documentar el componente Avatar existente con sus variantes de tamano, fallbacks, y reglas para logos/imagenes de marca
- **3. Documentacion y Accesibilidad** (nueva categoria): Guia de buenas practicas ARIA, contraste, navegacion por teclado, y reglas de documentacion para nuevos componentes

No se crean colores nuevos, no se modifican componentes existentes, no se inventan variantes visuales.

---

## Cambios detallados

### 1. Nueva seccion: IconsSection.tsx (1.8 Iconografia)

Ubicacion: `src/pages/design-system/sections/IconsSection.tsx`

Contenido:
- **Libreria oficial**: Documentar que el proyecto usa exclusivamente `lucide-react`. Prohibido usar otras librerias de iconos
- **Tamanos estandar**: Mostrar los 4 tamanos permitidos con ejemplos visuales:
  - `h-4 w-4` (16px) -- Dentro de botones, menu items, badges
  - `h-5 w-5` (20px) -- Iconos standalone en toolbars
  - `h-6 w-6` (24px) -- Tamano por defecto de Lucide, headers de seccion
  - `h-8 w-8` (32px) -- Empty states, iconos hero
- **Colores permitidos**: `currentColor` (hereda del padre), `text-muted-foreground`, `text-primary`, `text-destructive`
- **Galeria de iconos frecuentes**: Grid con los iconos ya usados en el proyecto (User, Settings, LogOut, Loader2, Trash2, ExternalLink, Info, AlertCircle, CheckCircle, AlertTriangle, ChevronDown, Keyboard) mostrando nombre y tamano
- **Reglas**: No usar iconos sin proposito semantico, siempre incluir `aria-hidden="true"` si el icono es decorativo, acompanar con texto o tooltip si es el unico elemento interactivo

### 2. Nueva seccion: AvatarsSection.tsx (1.9 Avatares y Logos)

Ubicacion: `src/pages/design-system/sections/AvatarsSection.tsx`

Contenido:
- **Componente Avatar**: Mostrar el componente `Avatar` de Radix/shadcn ya existente en el proyecto
- **Tamanos**: Documentar 4 tamanos con ejemplos visuales:
  - `h-8 w-8` -- Listas compactas, comentarios
  - `h-10 w-10` -- Tamano default, menus de usuario
  - `h-12 w-12` -- Cards de perfil, headers
  - `h-16 w-16` -- Paginas de perfil, hero
- **Fallback**: Mostrar como funciona `AvatarFallback` con iniciales cuando la imagen no carga
- **Grupos de avatares**: Ejemplo con avatares solapados (patron comun con `-space-x-2`)
- **Logos e imagenes de marca**: Documentar reglas para logos: mantener aspect ratio, usar `object-contain`, tamanos recomendados, y que deben ir siempre en `public/` o cargados desde CDN
- **Reglas**: Siempre usar el componente Avatar (no `img` directas), siempre incluir fallback, usar `rounded-full` siempre (ya incluido en el componente)

### 3. Nueva seccion: DocumentationSection.tsx (3.1 Documentacion y Accesibilidad)

Ubicacion: `src/pages/design-system/sections/DocumentationSection.tsx`

Contenido organizado en subsecciones:

**Accesibilidad (a11y)**
- Contraste minimo: documentar que los tokens actuales cumplen WCAG AA (4.5:1 para texto normal, 3:1 para texto grande)
- Navegacion por teclado: todos los componentes interactivos deben ser accesibles con Tab/Enter/Escape (ya cubierto por Radix)
- Focus visible: siempre usar `focus-visible:ring-2` (ya documentado en Estados Globales, aqui se refuerza)
- ARIA labels: reglas para cuando usar `aria-label`, `aria-describedby`, `sr-only`
- Orden de lectura: el DOM debe reflejar el orden visual (no reordenar con CSS sin considerar lectores de pantalla)

**Reglas de documentacion para nuevos componentes**
- Todo componente nuevo debe documentarse en esta pagina antes de usarse en produccion
- Estructura requerida: nombre, variantes, props, estados, reglas de uso, ejemplo visual
- Naming: PascalCase para componentes, kebab-case para archivos, camelCase para props
- Tokens: nunca hardcodear colores, usar siempre variables CSS del sistema
- Testing: todo componente debe ser navegable por teclado

**Checklist de accesibilidad**
- Lista verificable de items que todo componente debe cumplir: focusable, label, contraste, responsive, keyboard nav

---

## Cambios en archivos existentes

### DesignSystemPage.tsx

- Agregar imports de las 3 nuevas secciones
- Agregar a `navItems` la nueva categoria "FOUNDATIONS" items para 1.8 y 1.9
- Agregar nueva categoria "GUIDELINES" con item 3.1
- Agregar los componentes al area de contenido principal
- Los IDs de seccion nuevos se registran en el IntersectionObserver automaticamente (ya usa `navItems.flatMap`)

### Archivos nuevos

```
src/pages/design-system/sections/
  IconsSection.tsx          -- 1.8 Iconografia
  AvatarsSection.tsx        -- 1.9 Avatares y Logos
  DocumentationSection.tsx  -- 3.1 Documentacion y Accesibilidad
```

---

## Detalles tecnicos

**Dependencias**: Ninguna nueva. Se usan los componentes `Avatar`, `AvatarImage`, `AvatarFallback` ya existentes en `src/components/ui/avatar.tsx`, iconos de `lucide-react` ya instalado, y clases de Tailwind.

**Iconos para la galeria**: Se importaran directamente de `lucide-react` (tree-shakable). Solo se muestran los que ya se usan en el proyecto mas algunos adicionales comunes (Home, Search, Plus, X, Check, Eye, EyeOff, Mail, Lock, Calendar).

**Avatares**: Se usa el componente Avatar de Radix ya configurado. Las imagenes de ejemplo usaran URLs de placeholder (`/placeholder.svg` que ya existe en el proyecto) y fallbacks con iniciales.

**Sin cambios a componentes UI**: Los archivos en `src/components/ui/` no se tocan.

**Sin nuevos colores ni tokens**: Se usan exclusivamente los tokens ya definidos.

