

## Mejora visual del modal de permisos

### Cambios

**1. Header "Data permissions" - espaciado y layout**

El area de "Data permissions" en el header esta amontonada porque los 3 radio buttons estan en una sola fila (`flex gap-3`) dentro de una columna estrecha. Se cambiara a layout vertical (`flex-col`) con mejor espaciado, y se usara un `Select` dropdown o simplemente se apilaran verticalmente para que sean legibles.

**2. Cards del acordeon - quitar borde azul lateral**

Eliminar `border-l-[3px] border-l-primary` de las tarjetas de modulo. Se mantendra un borde sutil uniforme (`border border-border`) con fondo `bg-muted/30` para diferenciarlas sin el acento lateral.

### Seccion tecnica

**Archivo:** `src/pages/admin/SetPermissionsModal.tsx`

**Cambio 1 - Header Data permissions (lineas 178-192):**
- Cambiar el `RadioGroup` de `flex gap-3` a `flex flex-col gap-1.5 mt-1.5` para apilar los radio buttons verticalmente
- Aumentar ligeramente el tamano del texto de las labels de `text-[11px]` a `text-xs`

**Cambio 2 - Cards del acordeon (linea 211):**
- Reemplazar `border border-border rounded-lg border-l-[3px] border-l-primary bg-card` por `border border-border rounded-lg bg-muted/30` eliminando el borde azul lateral y usando un fondo sutil

