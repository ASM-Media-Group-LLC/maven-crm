

## Completar la seccion de Promolog con Plataformas, Filtros, Tabs y Entradas Recientes

### Resumen
Agregar las secciones faltantes en la vista dashboard de Promolog segun las imagenes de referencia:

1. Cambiar layout de social cards a horizontal (icono a la izquierda, nombre y valor a la derecha)
2. Agregar subseccion "Plataforma" con cards de OnlyFans, Unlok y Otra
3. Agregar texto footer "Mostrando datos del X al X"
4. Eliminar las KPI cards (no aparecen en las imagenes de referencia)
5. Agregar seccion colapsable "Filtros"
6. Agregar tab bar con Tabla, Calendario y Campanas
7. Agregar seccion "Entradas Recientes" con cards de entradas mock

### Archivo a modificar: `src/pages/promolog/PromologContent.tsx`

---

### 1. Layout de Social Cards (horizontal)
Cambiar de layout vertical centrado a horizontal:
```
[ Icono ]  Nombre
           Valor (grande)
```
Usar `flex items-center gap-3` en lugar de `flex-col items-center`.

### 2. Subseccion "Plataforma"
Agregar debajo de "Red Social" un subtitulo "Plataforma" y 3 cards en grid de 3 columnas:
- **OnlyFans**: icono circular azul, valor 5
- **Unlok**: icono circular morado, valor 0
- **Otra**: icono circular gris con "i", valor 0

Se crearan iconos simples inline (circulos con letras/simbolos) ya que no existen componentes de iconos para estas plataformas.

### 3. Footer con rango de fechas
Texto centrado: "Mostrando datos del {fecha} al {fecha}" usando la fecha seleccionada, en formato "13 feb".

### 4. Eliminar KPI Cards
Las 4 tarjetas KPI no aparecen en ninguna de las imagenes de referencia, se eliminaran de la vista dashboard.

### 5. Seccion colapsable "Filtros"
Usar el componente `Collapsible` existente:
- Trigger con icono chevron y texto "Filtros"
- Contenido vacio por ahora (placeholder para filtros futuros)

### 6. Tab Bar: Tabla | Calendario | Campanas
Usar el componente `Tabs` existente con `TabsList` y `TabsTrigger`:
- Tab "Tabla" con icono de tabla (activo por defecto)
- Tab "Calendario" con icono de calendario
- Tab "Campanas" con icono de target

### 7. Seccion "Entradas Recientes"
Titulo "Entradas Recientes" con icono de filtro a la derecha.

Cada entrada es una `Card` con:
- **Linea 1**: ID (badge outline, ej: PL065201), icono check verde, nombre en bold, @handle en muted, badges de red social (Instagram/X/Twitter con colores), badge plataforma (OnlyFans con borde naranja), badge resultado (Si en verde)
- **Linea 2**: icono calendario + fecha, icono reloj + hora, icono usuario + nombre agente
- **Linea 3**: "Notas:" en bold
- **Linea 4**: Texto de la nota
- **Boton "Editar"**: alineado a la derecha con icono de lapiz

Datos mock de 5 entradas segun las imagenes:
1. PL065201 - Desieee Daniela Gonzalez angel @deziig - Instagram, OnlyFans, Si - 10:05 AM - lorena_lozano - "CC promociona en IG, publica foto"
2. PL068144 - Veronica Sanchez - X/Twitter, OnlyFans, Si - 09:57 AM - lorena_lozano - "CC promociona en reddit, publica foto"
3. PL111676 - Valentin Magallanes @valentin.only - Instagram, OnlyFans, Si - 09:53 AM - lorena_lozano - "CC promociona en IG, publica video"
4. PL641620 - Elizabeth Loaiza @elizabethloaiza - Instagram, OnlyFans, Si - 09:48 AM - lorena_lozano - "CC promociona en IG, publica foto"
5. PL492883 - Alejandra Rojas Soto @alemiarojas - X/Twitter, OnlyFans, Si - 09:25 AM - lorena_lozano - "CC promociona en X, publica video"

### Detalles tecnicos

**Imports adicionales necesarios:**
- `Collapsible, CollapsibleTrigger, CollapsibleContent` de `@/components/ui/collapsible`
- `Tabs, TabsList, TabsTrigger, TabsContent` de `@/components/ui/tabs`
- Iconos adicionales de lucide: `ChevronDown, Filter, Pencil, Clock, User, CalendarIcon, Info, Table2`

**Colores de badges:**
- Instagram: `bg-background border` (neutral)
- X/Twitter: `bg-foreground text-background` (invertido/oscuro)
- OnlyFans: `border-orange-400 text-orange-500` (outline naranja)
- Si: `bg-green-500 text-white` (solido verde)

**Estructura final de la vista dashboard:**
```
Header + Action Bar
Promociones por Red Social y Plataforma
  Red Social (4 cards horizontales)
  Plataforma (3 cards horizontales)
  Footer con rango de fechas
Filtros (colapsable)
Tabs: Tabla | Calendario | Campanas
Entradas Recientes (lista de cards)
```

