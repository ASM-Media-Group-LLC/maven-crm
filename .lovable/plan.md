

## Corregir KPI Cards y agregar boton Editar en el Directorio de Empleados

### Problema 1: KPI Cards con layout diferente

Las KPI cards actuales del directorio usan un layout **horizontal** (icono a la izquierda, texto a la derecha) con un hover basico (`hover:scale hover:shadow-lg`). El estandar de la plataforma (`ContactosKPICards`) usa:

- Layout **vertical**: label arriba-izquierda, icono arriba-derecha, valor grande debajo, subtitulo al final
- Hover con **gradiente semantico** (`hover:bg-gradient-to-br hover:from-{color}/15 hover:to-transparent hover:border-{color}/40`)
- Colores del sistema: `text-muted-foreground`, `text-success`, `text-warning`, `text-destructive` (no `emerald-600` ni `amber-600` hardcoded)

### Problema 2: Sin opcion de editar

Actualmente solo hay botones de Ver (Eye) y Eliminar (Trash2). Falta un boton de Editar (Pencil) que lleve al perfil del empleado en modo edicion (o directamente al perfil donde se puede editar).

### Cambios en `src/pages/hr/EmployeeDirectory.tsx`

**KPI Cards** — Reescribir el componente `KPICard` para que siga exactamente el patron de `ContactosKPICards`:

```text
Antes (horizontal):
[ [icono] Valor  ]
[         Label  ]

Despues (vertical, como ContactosKPICards):
[ Label          [icono] ]
[ Valor (grande)         ]
[ Subtitulo              ]
```

- Cada card tendra: `label`, `value`, `subtitle`, `icon`, `colorClass`, `bgClass`, `hoverClass`
- Hover con gradiente semantico y transicion `transition-all duration-200`
- Tokens semanticos en vez de colores hardcoded:
  - Total: `text-muted-foreground` / `bg-muted`
  - Activos: `text-success` / `bg-success/20`
  - En Licencia: `text-warning` / `bg-warning/20`
  - Inactivos: `text-destructive` / `bg-destructive/20`

**Boton Editar** — Agregar un boton con icono `Pencil` en:
- **Tabla**: nueva columna de accion entre Ver y Eliminar, que navega a `/hr/empleado/{id}` (el perfil ya soporta edicion)
- **Grid**: nuevo boton Pencil en el footer de cada card junto al boton de eliminar

### Archivo a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/hr/EmployeeDirectory.tsx` | Reescribir KPICard con layout vertical y hover gradiente (patron ContactosKPICards). Agregar boton Pencil de edicion en tabla y grid. Usar tokens semanticos. |
