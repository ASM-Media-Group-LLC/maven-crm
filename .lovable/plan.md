
# Headers de tabla fijos y columna de acciones siempre visible

## Resumen

Aplicar sticky header y columna de acciones fija (sticky right) a todas las tablas de la aplicacion que aun no lo tienen. Las tablas de Contactos y Creadores ya implementan sticky header; se extendera el patron al resto.

## Tablas a modificar

### 1. `src/pages/eventos/EventosTable.tsx`
- Envolver la `<Table>` en un contenedor con `max-h-[calc(100vh-24rem)] overflow-auto`
- Agregar `className="sticky top-0 z-10 bg-card"` al `<TableHeader>`
- Agregar `sticky right-0 bg-card` al `<TableHead>` y `<TableCell>` de la columna "Acciones"

### 2. `src/pages/sales-performance/EarningsTable.tsx`
- Agregar `max-h-[calc(100vh-24rem)]` al contenedor existente (`overflow-x-auto` ya esta)
- Agregar `className="sticky top-0 z-10 bg-card"` al `<TableHeader>`
- Esta tabla no tiene columna de acciones visible, asi que no aplica sticky right

### 3. `src/pages/sales-dashboard/CreatorsTable.tsx`
- Agregar `max-h-[calc(100vh-24rem)]` al contenedor existente (`overflow-x-auto`)
- Agregar `className="sticky top-0 z-10 bg-card"` al `<TableHeader>`
- Agregar `sticky right-0 bg-card` al `<TableHead>` y `<TableCell>` de "Acciones"

### 4. `src/pages/leadgen/LeadGenContent.tsx` (tabla de Supervisores)
- Envolver la `<Table>` de supervisores en un contenedor con `max-h-[calc(100vh-24rem)] overflow-auto`
- Agregar `className="sticky top-0 z-10 bg-card"` al `<TableHeader>`
- Agregar `sticky right-0 bg-card` al `<TableHead>` y `<TableCell>` de "Acciones"

### 5. `src/pages/contactos/ContactosTable.tsx` (solo acciones sticky)
- Ya tiene sticky header. Agregar `sticky right-0 bg-card z-20` al `<TableHead>` y `<TableCell>` de la columna "Acciones"

### 6. `src/pages/creadores/CreadoresTable.tsx` (solo acciones sticky)
- Ya tiene sticky header. Agregar `sticky right-0 bg-card z-20` al `<TableHead>` y `<TableCell>` de la columna "Acciones"

### Tablas excluidas
- **DocumentosTabContent** y **MonetizacionTabContent**: Son tablas pequenas dentro de tabs de perfil de creador, no requieren scroll interno ni acciones sticky.

## Detalle tecnico

Para que `sticky right-0` funcione correctamente en una tabla con scroll horizontal:
- El `<TableHead>` de acciones recibe `className="sticky right-0 bg-card z-20"`
- El `<TableCell>` de acciones recibe `className="sticky right-0 bg-card"`
- Se usa `z-20` en el header para que quede sobre el body cuando ambos ejes hacen scroll

El patron de sticky header usa `sticky top-0 z-10 bg-card` en el `<TableHeader>`, dentro de un contenedor con `overflow-auto` y `max-h-[calc(100vh-24rem)]`.
