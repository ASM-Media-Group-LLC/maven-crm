
## Correcciones: Header de Asistencia + Módulo de Ausencias completo

### Problema 1 — Header de Control de Asistencia

El header actual usa `text-2xl font-bold` en lugar de `text-xl font-semibold`, que es el estándar de la plataforma. Comparando con otros módulos como Vacaciones y Creadores, el título debe ser `text-xl font-semibold` para mantener la jerarquía visual consistente.

**Cambio:**
```tsx
// Línea 386 — ACTUAL
<h2 className="text-2xl font-bold tracking-tight">Control de Asistencia</h2>

// CORRECTO
<h1 className="text-xl font-semibold text-foreground">Control de Asistencia</h1>
```

---

### Problema 2 — HRAbsences: Reconstrucción completa

El módulo actual es una página básica sin seguir el estándar de la plataforma. La imagen de referencia muestra exactamente la estructura requerida:

**Estado actual (incompleto):**
- Layout: `p-6 space-y-5` (sin scroll interno, sin h-full)
- Sin KPI cards
- Sin tabs de departamento
- Sin búsqueda ni toggle lista/grid
- Modal sin header/footer fijos (no sigue el patrón `!flex !flex-col gap-0`)
- Sin vista Grid

**Estado requerido (basado en imagen de referencia y estándar de plataforma):**

```text
<div className="flex flex-col h-full overflow-hidden">
  ┌─ Header shrink-0 ─────────────────────────────────────────┐
  │  [⚠] Ausencias / Faltas                  [+ Registrar Falta] │
  │  Faltas injustificadas y sin aviso previo                 │
  └───────────────────────────────────────────────────────────┘
  ┌─ flex-1 overflow-auto p-6 ────────────────────────────────┐
  │  KPI Cards: Total Faltas | Pendientes | Este Mes          │
  │                                                           │
  │  Department tabs: Todos | Ventas | LeadGen | ...          │
  │                                                           │
  │  Filter row: [🔍] [Todos los tipos ▾] [Todos ▾] [📅] [≡ ⊞] │
  │  "Mostrando X de Y registros"                             │
  │                                                           │
  │  Tabla / Grid (sticky header, sticky acciones)            │
  └───────────────────────────────────────────────────────────┘
</div>
```

---

### KPI Cards (3 cards — según imagen de referencia)

| Card | Valor | Icono | Color |
|---|---|---|---|
| Total Faltas | `count(all)` | `AlertTriangle` | `primary` |
| Pendientes | `status === 'pending'` | `Clock` | `warning` |
| Este Mes | Registros del mes actual | `CalendarDays` | `primary` |

---

### Tabla (vista Lista)

Columnas según imagen de referencia:

| Columna | Detalle |
|---|---|
| Empleado | Avatar iniciales + nombre bold + cargo debajo |
| Tipo de Falta | Badge con el tipo (colores semánticos) |
| Fechas | Rango compacto: "19 dic - 21 dic" |
| Días | Número en círculo |
| Observaciones | Texto truncado |
| Estado | Badge: Pendiente Justificar (warning) / Aprobada (success) / Rechazada (destructive) |
| Acciones | ✓ (aprobar) + ✗ (rechazar) + 👁 (ver), sticky right |

---

### Vista Grid

Cards por ausencia:
- Avatar iniciales + nombre + cargo
- Badge tipo de falta + badge estado
- Fechas (rango) + días
- Observaciones (line-clamp-2)
- Footer: acciones (✓/✗/👁)

---

### Modal "Registrar Falta" (patrón estándar con header + scroll + footer fijos)

Siguiendo exactamente la imagen de referencia:
```text
DialogContent "!flex !flex-col gap-0 max-w-md p-0 overflow-hidden"
  DialogHeader shrink-0 (border-b)
    ⚠ Registrar Falta
    "Registra una falta injustificada o sin aviso previo"
  div flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4
    Empleado * (EmployeeSearchCombobox)
    Tipo de Falta * (Select con icono y descripción)
    Fecha Inicio * + Fecha Fin * (grid 2 cols, Popover calendar)
    Observaciones (Textarea)
  DialogFooter shrink-0 (border-t)
    Cancelar | + Registrar Falta (variant="destructive")
```

El botón de submit usa `variant="destructive"` (rojo) como en la imagen de referencia, por tratarse de una acción de registro de falta — diferente del estándar azul de creación normal.

---

### Filtros

- **Búsqueda**: Input con icono Search (buscar por empleado o razón)
- **Todos los tipos**: Select con `ABSENCE_TYPES` + "Todos los tipos"  
- **Todos**: Select de estado (Todos / Pendiente / Aprobada / Rechazada)
- **Filtrar por fecha**: Popover con DateRangePicker compacto
- **Toggle Lista/Grid**: Botones con `ListIcon` y `LayoutGrid`

---

### Tabs de departamento

Mismo patrón que Asistencia: `inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1` con botones `secondary`/`ghost`.

La query de absences se actualiza para incluir `employees(first_name, last_name, employee_code, job_title, department_id, departments(id, name))`.

---

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/hr/HRAttendance.tsx` | Línea 386: `text-2xl font-bold tracking-tight` → `text-xl font-semibold text-foreground` |
| `src/pages/hr/HRAbsences.tsx` | Reconstrucción completa con layout estándar, KPIs, tabla, grid, modal con patrón fijo |

La tabla `absences` ya tiene todos los campos necesarios. No se requieren migraciones de base de datos.
