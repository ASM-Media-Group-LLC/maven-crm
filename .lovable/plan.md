

## Plan: Mejorar tabla ejemplo del Design System

### Cambios en `DataDisplaySection.tsx`

#### 1. Más filas visibles (8 filas, 6 sin scroll)
- Agregar 3 filas más al array de datos (total 8)
- Cambiar `max-h-[200px]` → `max-h-[340px]`

#### 2. Header "Acciones" visible
- Línea 201: cambiar `<TableHead className={STICKY_ACTION_HEADER_CLASS}></TableHead>` a `<TableHead className={STICKY_ACTION_HEADER_CLASS}>Acciones</TableHead>`

#### 3. Scroll lateral demostrable
- Agregar columnas "Estado" y "Notas" al ejemplo
- Cambiar `min-w-[700px]` → `min-w-[1000px]`

### Archivo: `src/pages/design-system/sections/DataDisplaySection.tsx`

