

# Integrar Design System en una nueva pagina

## Resumen

Se creara una pagina dedicada `/design-system` que muestra visualmente todos los tokens y componentes definidos en el archivo JSON exportado. Ademas, se actualizaran los CSS variables y la configuracion de Tailwind para que coincidan con el nuevo design system (tema oscuro con azul primario y morado como accent).

## Que se va a hacer

### 1. Actualizar los CSS tokens globales (`src/index.css`)

Reemplazar las variables CSS actuales (tema claro por defecto) con los valores del design system importado:

- **Tema principal (`:root`)**: Fondo oscuro (`240 8% 10%`), primary azul (`211 100% 50%`), accent morado (`271 91% 50%`), etc.
- **Agregar nuevos tokens**: `--success`, `--success-foreground`, `--instagram-pink`, `--instagram-purple`, `--instagram-orange`
- **Sidebar tokens**: Actualizar con los valores del JSON
- Se eliminara el bloque `.dark` ya que el design system define un unico tema oscuro como base

### 2. Actualizar Tailwind config (`tailwind.config.ts`)

- Agregar colores `success` y `success-foreground` al extend de colores
- Agregar colores de Instagram (`instagram-pink`, `instagram-purple`, `instagram-orange`)

### 3. Extender variantes del Badge (`src/components/ui/badge.tsx`)

Agregar las variantes adicionales definidas en el JSON:
- `success`, `warning`, `info`
- `success-soft`, `warning-soft`, `destructive-soft`, `primary-soft`, `secondary-soft`

### 4. Crear la pagina Design System (`src/pages/DesignSystem.tsx`)

Una pagina visual con scroll que muestre todas las secciones del design system:

- **Header**: Nombre, version y fecha de exportacion
- **Seccion Colores**: Grid con swatches de todos los colores (background, foreground, primary, secondary, accent, destructive, success, muted, border, sidebar, instagram) mostrando nombre, valor HSL y descripcion
- **Seccion Tipografia**: Escala tipografica (xs a 5xl) con ejemplos visuales del texto en cada tamano, y los pesos disponibles (thin a black)
- **Seccion Espaciado**: Barras visuales horizontales representando cada valor de spacing (0 a 16)
- **Seccion Border Radius**: Cuadros mostrando cada nivel de redondeo (none, sm, md, lg, xl, 2xl, full)
- **Seccion Sombras**: Tarjetas con los 3 niveles de sombra (minimal, card, elevated)
- **Seccion Componentes - Badges**: Todos los badges en todas sus variantes
- **Seccion Componentes - Buttons**: Todos los botones en todas sus variantes y tamanos

### 5. Agregar ruta en `src/App.tsx`

Registrar la nueva ruta `/design-system` que apunte a la pagina creada.

## Detalles tecnicos

**Archivos a modificar:**
- `src/index.css` - Variables CSS del design system
- `tailwind.config.ts` - Colores extendidos (success, instagram)
- `src/components/ui/badge.tsx` - Nuevas variantes (success, warning, info, soft variants)
- `src/App.tsx` - Ruta nueva

**Archivos a crear:**
- `src/pages/DesignSystem.tsx` - Pagina completa del design system

**Sin dependencias nuevas** - Todo se construye con los componentes UI existentes (Card, Badge, Button) y clases de Tailwind.

