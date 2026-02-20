

## Estandarizar el Directorio de Empleados

### Problemas actuales

1. **Header diferente**: Usa `HRPageHeader` con caja de icono (`bg-primary/10`), prohibida por el sistema de diseno. Otros directorios (Contactos, Creadores) usan `header` con `text-2xl font-bold`, subtitulo, y boton CTA directo.
2. **Sin layout estandar**: Usa `div className="p-6 space-y-5"` en vez del patron `main > header fijo (border-b) + div scroll (flex-1 overflow-auto)`.
3. **Sin KPI cards**: Contactos y Creadores muestran tarjetas de resumen (Total, Activos, Inactivos, Nuevos). El directorio de empleados no tiene ninguna.
4. **Sin tab bar de departamentos**: Creadores usa un tab bar (`inline-flex rounded-lg border bg-muted/50 p-1`) para filtrar por agencia. El directorio deberia tener lo mismo para departamentos.

### Solucion

Reescribir `EmployeeDirectory.tsx` para que siga exactamente el mismo patron que `ContactosContent` y `CreadoresContent`:

```text
<main flex-1 flex-col h-full overflow-hidden>
  <header shrink-0 bg-background px-6 border-b>
    Titulo "Directorio de Empleados" (text-2xl font-bold)
    Subtitulo "Total: N empleados"
    Boton "Nuevo Empleado" (default variant)
  </header>

  <div flex-1 overflow-auto p-6 space-y-6>
    1. KPI Cards (4 tarjetas: Total, Activos, En Licencia, Inactivos)
    2. Tab bar de departamentos (Todos + cada departamento dinamico)
    3. Filtros (search + status + toggle list/grid)
    4. Tabla o Grid
  </div>
</main>
```

### Cambios detallados

#### Archivo: `src/pages/hr/EmployeeDirectory.tsx` — Reescribir

**Header**:
- Eliminar import y uso de `HRPageHeader`
- Usar `<main>` con `flex-1 flex-col h-full overflow-hidden min-w-0`
- Header: `<header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">`
- Titulo: `<h1 className="text-2xl font-bold">Directorio de Empleados</h1>`
- Subtitulo: `<p className="text-sm text-muted-foreground">Total: {employees.length} empleados</p>`
- CTA: `<Button>` (variant default, no size="sm") con icono Plus

**KPI Cards** (nuevas, debajo del header en la zona scroll):
- 4 tarjetas usando el mismo patron de `ContactosKPICards`:
  - Total Empleados (icon Users, color muted)
  - Activos (icon UserCheck, color success)
  - En Licencia/Vacaciones (icon Clock, color warning)
  - Inactivos (icon UserMinus, color destructive)
- Cada card con hover animado (`hover:scale-[1.03]`) igual que Contactos

**Tab bar de departamentos** (nuevo):
- Contenedor `inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1`
- Boton "Todos" + un boton por cada departamento (obtenido de `useDepartments()`)
- Filtra `deptFilter` al hacer clic (mismo patron que agencias en Creadores)
- Variantes: `secondary` (activo) y `ghost` (inactivo)
- Esto reemplaza el `Select` de departamento actual

**Filtros**:
- Mantener: buscador con icono Search, Select de estado, toggle list/grid
- Eliminar: el Select de departamento (reemplazado por tab bar)

**Contenido scroll**:
- Envolver todo en `<div className="flex-1 overflow-auto p-6 space-y-6">`
- Orden: KPIs, tab bar departamentos, filtros, tabla/grid

### Archivo a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/hr/EmployeeDirectory.tsx` | Reescribir layout completo: header estandar (sin HRPageHeader), KPI cards, tab bar de departamentos, filtros simplificados, todo dentro del patron main/header/scroll |

