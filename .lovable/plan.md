
## Plan: Hacer visible el scroll lateral y documentar paginación obligatoria en el estándar de tablas

### Diagnóstico
El ejemplo actual del Design System no está mostrando lo que quieres por 2 razones:

1. **No usa `DataTableShell` realmente**
   - La documentación habla de paginación fija abajo, pero el ejemplo “live” está renderizando solo un `div overflow-auto` con `<Table>`.
   - Por eso **no aparece el footer con paginador**.

2. **No se fuerza overflow horizontal en el viewport actual**
   - La tabla tiene `min-w-[1000px]`, pero tu viewport visible es bastante ancho.
   - Resultado: aunque el contenedor tenga `overflow-auto`, **no hay scroll lateral visible** porque la tabla todavía cabe.

### Qué voy a cambiar

#### 1. Convertir el ejemplo del Design System en el patrón real
En `src/pages/design-system/sections/DataDisplaySection.tsx`:
- Reemplazar el demo actual por un ejemplo montado con **`DataTableShell`**
- Usar estado local simple de paginación (`currentPage`, `pageSize`)
- Mostrar el footer inferior real:
  - contador de registros
  - selector de filas
  - paginador

Así el Design System deja de “describir” el patrón y pasa a **demostrarlo**.

#### 2. Hacer el scroll lateral claramente visible
En ese mismo ejemplo:
- Encerrar la demo en un ancho deliberadamente más estrecho que la tabla
- Aumentar el ancho mínimo de la tabla a algo como `min-w-[1200px]` o similar
- Mantener suficientes columnas para que el overflow horizontal sea obvio
- Si hace falta, añadir una nota visual breve tipo “desplaza horizontalmente para ver más columnas”

Con esto el scroll lateral sí se verá en `/design-system`.

#### 3. Mantener al menos 6 filas visibles
- Ajustar la altura del área scrollable del ejemplo para que muestre mínimo 6 filas antes de hacer scroll vertical
- Mantener dataset de ejemplo suficiente para que se vea también el comportamiento con paginación

#### 4. Dejar “Acciones” visible en el header
- Mantener el header sticky de la última columna con texto **“Acciones”**
- Alinear header y celdas para que el patrón quede correcto como referencia oficial

#### 5. Endurecer la documentación del estándar
En la misma sección del Design System voy a dejar explícito que:
- **todas las tablas de alto volumen deben usar `DataTableShell`**
- **toda tabla grande debe tener paginación inferior**
- **la tabla debe soportar scroll horizontal cuando excede el ancho disponible**
- el patrón base de referencia seguirá siendo **Contactos**

### Archivos a tocar
1. `src/pages/design-system/sections/DataDisplaySection.tsx`
   - migrar el demo a `DataTableShell`
   - hacer visible el scroll horizontal
   - mostrar paginación real
   - ajustar alto para 6+ filas
   - reforzar la documentación del estándar

2. `src/components/ui/data-table-shell.tsx` *(solo si hace falta)*
   - revisar si necesita un pequeño ajuste visual para que el footer/paginador quede más claro en demos y tablas reales
   - no lo tocaría salvo que el ejemplo revele una limitación real del shell

### Resultado esperado
- En `/design-system` se verá claramente:
  - **scroll lateral**
  - **scroll vertical**
  - **header sticky**
  - **columna Acciones sticky**
  - **footer con paginación**
- El componente quedará documentado como el estándar oficial para reutilizarlo luego en Closers, LeadGen y el resto del sistema sin inconsistencias.
