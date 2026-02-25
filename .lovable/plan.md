

## Plan: Mejorar visibilidad del líder, progreso y descripcion del proyecto

### Problema actual

1. En la vista interna del proyecto (`TareasContent.tsx`), el líder aparece como texto diminuto (`text-xs text-muted-foreground`) junto al subtítulo, y la barra de progreso es muy delgada (`h-2`) y está aislada en la esquina superior derecha -- pasa desapercibida.
2. No se muestra la descripcion del proyecto en la vista interna.
3. En las cards de la lista de proyectos (`ProjectsListContent.tsx`), la barra de progreso ya existe pero es muy delgada (`h-1.5`) y el líder usa texto diminuto.

### Cambios propuestos

#### 1. `src/pages/tareas/useTareas.ts` — Incluir `description` en la query del proyecto

Actualmente la query solo trae `name` y `leader_id`. Agregar `description` al select para poder mostrarla en el header.

#### 2. `src/pages/tareas/TareasContent.tsx` — Redisenar header del proyecto

Reemplazar el header actual con un diseño mas prominente:

- **Línea 1**: Nombre del proyecto (ya existe) + botón Nueva Tarea (ya existe)
- **Línea 2**: Descripcion del proyecto en `text-sm text-muted-foreground` (nueva)
- **Línea 3**: Fila con:
  - Icono Shield + nombre del líder en `text-sm font-medium` (mas visible que `text-xs`)
  - Barra de progreso mas gruesa (`h-3`) con porcentaje, ocupando mas ancho (`min-w-[200px]`)

Esto reemplaza la disposicion actual donde el líder y el progreso están escondidos en rincones separados.

#### 3. `src/pages/tareas/TareasContent.tsx` — Cards KPI con info del proyecto

Agregar una card resumen del proyecto antes de las KPI cards (o como primera card destacada) que muestre:
- Descripcion del proyecto
- Líder del proyecto
- Barra de progreso prominente

Alternativa: integrar la descripcion, líder y progreso directamente en el header rediseñado (punto 2), sin card adicional, para no agregar ruido visual. Se opta por esta alternativa ya que las KPI cards ya cumplen la funcion de resumen.

#### 4. `src/pages/tareas/ProjectsListContent.tsx` — Mejorar visibilidad en cards de grid

- Aumentar grosor de la barra de progreso de `h-1.5` a `h-2.5`
- Hacer el nombre del líder mas visible: `text-sm` en vez de `text-xs`, con `font-medium`
- Asegurar que la descripcion ya se muestra (ya está, pero confirmar que no esté truncada en exceso)

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/tareas/useTareas.ts` | Agregar `description` al select de projectData y exponerla en el return |
| `src/pages/tareas/TareasContent.tsx` | Redisenar header: descripcion visible, líder prominente con texto mas grande, progress bar mas gruesa y ancha |
| `src/pages/tareas/ProjectsListContent.tsx` | Progress bar mas gruesa, líder con texto mas grande |

