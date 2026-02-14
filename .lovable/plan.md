
## Convertir sidebar del Design System en barra de navegacion horizontal

### Problema
El Design System tiene su propio sidebar (`w-60`, `hidden lg:block`) que oculta o compite con el sidebar principal de la plataforma.

### Solucion
Reemplazar el sidebar interno por una barra de navegacion horizontal sticky debajo del header estandarizado. Las categorias se mostraran como chips/botones scrollables horizontalmente.

### Cambios en `src/pages/design-system/DesignSystemPage.tsx`

1. **Eliminar el sidebar completo** (lineas 110-144): quitar el `<nav>` con `w-60` y toda su estructura interna.

2. **Aplicar el layout estandar de la plataforma**:
   - Contenedor: `flex-1 flex flex-col h-full overflow-hidden min-w-0`
   - Header sticky: `bg-background px-6 pt-6 pb-4 border-b border-border shrink-0`
   - Titulo: `text-2xl font-bold` con "Design System", subtitulo descriptivo, y ThemeToggle + badge "v1.0.0" a la derecha

3. **Agregar barra de navegacion horizontal** debajo del header:
   - Un contenedor con `px-6 py-3 border-b border-border shrink-0 overflow-x-auto`
   - Los 5 grupos (Foundations, Components, Layout, Icons, Docs) como botones/chips inline
   - Cada grupo muestra sus items en la misma fila, separados por un separador visual sutil entre grupos
   - El boton activo usa `bg-primary/15 text-primary font-medium`, inactivos `text-muted-foreground hover:text-foreground hover:bg-muted`
   - Click en cada boton hace scroll a la seccion correspondiente
   - El IntersectionObserver sigue funcionando para actualizar el item activo automaticamente

4. **Area de contenido scrollable**: `flex-1 overflow-auto p-6 space-y-20` con todas las secciones existentes sin cambios.

5. **Quitar `max-w-5xl mx-auto`** del main para que use ancho completo siguiendo el patron de la plataforma.

6. **Eliminar el header mobile condicional** (`lg:hidden`) ya que el nuevo header sera visible siempre.

### Estructura visual resultante

```text
+--------------------------------------------------+
| Header: "Design System"  [v1.0.0]  [Light/Dark] |
+--------------------------------------------------+
| 1.1 Colores | 1.2 Tipo | ... | 2.1 Botones | ...|
+--------------------------------------------------+
|                                                  |
|  (contenido scrollable con todas las secciones)  |
|                                                  |
+--------------------------------------------------+
```

### Archivo

| Archivo | Cambio |
|---------|--------|
| `src/pages/design-system/DesignSystemPage.tsx` | Eliminar sidebar, agregar header estandar + tab bar horizontal con scroll, layout full-width |
