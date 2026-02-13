

## Actualizar columna de Acciones en la tabla de LeadGen

### Cambios

**Archivo**: `src/pages/leadgen/LeadGenTable.tsx`

#### 1. Agregar el texto "Acciones" al encabezado de la columna sticky
Actualmente la linea 128 tiene el `TableHead` vacio. Se cambiara a mostrar el texto "Acciones".

```
<TableHead className="sticky right-0 bg-card z-20">Acciones</TableHead>
```

#### 2. Reemplazar el menu de tres puntos por acciones inline visibles
Segun la imagen de referencia, la columna de acciones muestra directamente:
- Un boton con icono de ojo (`Eye`) para ver detalle
- El dropdown de calidad (badge "A+" con chevron) reubicado aqui

**Cambio en la celda de acciones** (lineas 198-214): Reemplazar el `DropdownMenu` de tres puntos por un layout `flex` con:
- Boton `Eye` (ghost, icon) que ejecuta `onView?.(lead)`
- El dropdown de calidad existente (badge + chevron + menu de categorias) movido desde la columna "Calidad" actual

#### 3. Simplificar la columna "Calidad"
La columna "Calidad" original (lineas 157-179) se simplificara para mostrar solo el badge estatico sin el dropdown, ya que la interaccion de cambio de calidad se movera a la columna de acciones.

### Resultado visual esperado
La columna "Acciones" (sticky right) mostrara en cada fila:
- Icono de ojo para ver detalle
- Badge de calidad con chevron desplegable para cambiar categoria

Esto replica el diseno 1:1 de la imagen de referencia.

