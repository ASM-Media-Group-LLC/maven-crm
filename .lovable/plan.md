

## Permisos de Roles: Funcionalidad completa + Mejora visual

### Problemas actuales

1. **Admin sin permisos pre-cargados**: Al abrir "Set permissions" para Admin, todo aparece desmarcado. No hay logica para inicializar permisos por defecto segun el tipo de rol.
2. **"All" de Menus no incluye funciones**: El checkbox "All" de Menus solo marca los modulos principales, no activa las funciones (submodulos) automaticamente.
3. **Visual diferente a la referencia**: Las tarjetas de modulos no tienen el estilo oscuro con borde izquierdo de acento que muestra la imagen.

### Cambios planificados

**1. Logica de inicializacion inteligente para Admin**

Cuando se abra el modal para el rol "admin" y no tenga permisos guardados en la base de datos (perm_count = 0), se pre-seleccionaran automaticamente:
- Todos los menus activados
- Todas las funciones activadas
- Data scope = "all" para todos

Esto garantiza que Admin tenga acceso completo por defecto.

**2. Mejorar el toggle "All" de Menus**

Actualmente el checkbox "All" de Menus solo marca `can_access` en los modulos principales. Se modificara para que al marcar "All" en Menus, tambien se activen automaticamente todas las funciones (submodulos). Esto simula el comportamiento de "seleccionar todo" como se espera.

**3. Toggle individual de modulo activa sus submodulos**

Al marcar/desmarcar un modulo, se marcaran/desmarcaran automaticamente todos sus submodulos.

**4. Mejora visual de las tarjetas de modulos**

Ajustar el estilo de las tarjetas para que se parezcan mas a la referencia:
- Borde izquierdo de color acento (primary) de 3px
- Fondo ligeramente diferenciado (card/muted)
- Checkbox con color de acento mas visible
- "Ver detalles" con chevron alineado a la derecha de la tarjeta
- Layout: checkbox + nombre en bold a la izquierda, "X funciones" al centro, "All data" a la derecha
- Chevron de expansion alineado al extremo derecho

### Seccion tecnica

**Archivo a modificar:** `src/pages/admin/SetPermissionsModal.tsx`

**Cambios especificos:**

1. **useEffect de inicializacion** (lineas 40-56): Agregar condicion para detectar si el rol es "admin" y no tiene permisos guardados, en cuyo caso inicializar todo como `can_access: true, data_scope: "all"`.

2. **toggleAllMenus** (lineas 65-71): Extender para que al activar todos los menus, tambien active todas las funciones (submodulos).

3. **toggleModule** (lineas 89-94): Extender para que al marcar un modulo, tambien marque todos sus submodulos.

4. **JSX de tarjetas de modulo** (lineas 198-271): Redisenar el layout de cada tarjeta para:
   - Agregar `border-l-3 border-l-primary` al contenedor
   - Usar `bg-card` como fondo
   - Mover el chevron de expansion al extremo derecho de la fila principal
   - Mantener grid de 3 columnas: (checkbox + nombre), (count funciones), (data scope label + chevron)

5. **Encabezado global** (lineas 162-186): Asegurar que los radio buttons globales de "Data permissions" funcionen correctamente y que las etiquetas sean legibles.

No se requieren cambios de base de datos ni nuevas tablas.

