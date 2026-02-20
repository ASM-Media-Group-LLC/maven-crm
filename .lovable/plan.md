
## Plan: Eliminar Licencias + Construir módulo Permisos completo + Fix de filtros

### Contexto del estado actual

- `Licencias` en el sidebar tiene `url: null` — no existe página, solo es un placeholder. Se elimina del sidebar.
- `Permisos` en el sidebar tiene `url: null` — tampoco existe. Se construye desde cero.
- No existe ningún archivo `HRPermisos.tsx` ni `HRLicencias.tsx`.
- El problema de filtros en `HRAbsences.tsx` y `HRVacations.tsx`: los selects están inicializados con `value="all"` y tienen un `<SelectItem value="all">Todos los tipos</SelectItem>`. Esto hace que Radix UI muestre el texto del item seleccionado ("Todos los tipos"), **no** el placeholder. El placeholder en Shadcn/Radix solo se muestra cuando el valor es `undefined` o `""`.

### Problema de filtros — Fix estándar

El patrón correcto para que el Select muestre el nombre de la categoría como placeholder por defecto:

```tsx
// ANTES — muestra "Todos los tipos" o "Todos" (texto del SelectItem con value="all")
const [typeFilter, setTypeFilter] = useState("all");
<Select value={typeFilter} onValueChange={setTypeFilter}>
  <SelectTrigger><SelectValue placeholder="Tipo de Falta" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="all">Todos los tipos</SelectItem>
    ...
  </SelectContent>
</Select>

// DESPUÉS — muestra "Tipo de Falta" (placeholder) cuando no hay filtro activo
const [typeFilter, setTypeFilter] = useState("");
<Select value={typeFilter} onValueChange={setTypeFilter}>
  <SelectTrigger><SelectValue placeholder="Tipo de Falta" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="">Todos</SelectItem>  {/* ← value="" dispara reset */}
    ...
  </SelectContent>
</Select>
// En el filtrado: matchType = !typeFilter || a.absence_type === typeFilter
```

Este fix aplica a **`HRAbsences.tsx`** (Tipo de Falta + Estado) y a **`HRVacations.tsx`** (Estado), y se implementará también en el nuevo módulo de Permisos desde el inicio.

---

### Módulo Permisos — Tabla de datos

Se reutiliza la tabla `absences` filtrando por `absence_type IN (tipos de permiso)`. No se requiere migración.

Los tipos de permiso son:
- `permiso_remoto` — Trabajo Remoto
- `salida_temprana` — Salida Temprana
- `llegada_tarde` — Llegada Tarde
- `permiso_personal` — Permiso Personal
- `permiso_medico` — Permiso Médico
- `permiso_academico` — Permiso Académico
- `permiso_diligencia` — Diligencia Personal

Estos coinciden con los tipos mostrados en la imagen de referencia (el badge "Trabajo Remoto" y "Salida Temprana" son visibles).

---

### Estructura del módulo Permisos (`HRPermisos.tsx`)

```text
<div className="flex flex-col h-full overflow-hidden">
  ┌─ Header shrink-0 ─────────────────────────────────────────┐
  │  [🕐] Permisos              [+ Solicitar Permiso]         │
  │  Gestiona las solicitudes de permisos de horario          │
  └───────────────────────────────────────────────────────────┘
  ┌─ flex-1 overflow-auto p-6 ────────────────────────────────┐
  │  KPI Cards: Total | Pendientes | Aprobados | Este Mes     │
  │                                                           │
  │  Department tabs: Todos | Ventas | LeadGen | ...          │
  │                                                           │
  │  Filter row: [🔍] [Tipo de Permiso ▾] [Estado ▾] [📅] [≡⊞] │
  │  "Mostrando X de Y registros"                             │
  │                                                           │
  │  Tabla / Grid (sticky header, sticky acciones)            │
  └───────────────────────────────────────────────────────────┘
</div>
```

**KPI Cards (4):**

| Card | Valor | Icono | Color |
|---|---|---|---|
| Total | `count(all)` | `FileText` | `primary` |
| Pendientes | `status === 'pending'` | `Clock` | `warning` |
| Aprobados | `status === 'approved'` | `CheckCircle2` | `success` |
| Este Mes | Registros del mes actual | `CalendarDays` | `primary` |

**Columnas de tabla (según imagen de referencia):**

| Columna | Detalle |
|---|---|
| Empleado | Avatar iniciales + nombre bold + correo debajo |
| Tipo | Badge de color con icono (Trabajo Remoto, Salida Temprana, etc.) |
| Fecha | Fecha formateada (una sola fecha para permisos, no rango) |
| Horario | Campo `notes` con el horario (ej. "14:00") |
| Motivo | Texto truncado |
| Estado | Badge: Pendiente / Aprobado / Rechazado |
| Acciones | ✓ + ✗ + 👁 si pending; solo 👁 si no |

**Vista Grid:** Cards con misma info que la tabla.

**Modal "Solicitar Permiso"** (patrón `!flex !flex-col gap-0`):
- Empleado (`EmployeeSearchCombobox`)
- Tipo de Permiso (`Select` con los 7 tipos)
- Fecha (`Popover` + `Calendar` — un solo día, no rango)
- Horario (campo `notes` — Input de texto, ej. "14:00 - 17:00")
- Motivo (`Textarea`)
- Botón CTA: `variant="default"` — "Crear Solicitud"

**Filtros con fix de placeholder:**
- Búsqueda: `Buscar por nombre o mot...`
- Tipo de Permiso: placeholder "Tipo de Permiso" (no "Todos los tipos")
- Estado: placeholder "Estado" (no "Todos")
- DateRangePicker o fecha puntual para filtrar
- Toggle Lista/Grid

---

### Archivos a crear / modificar

| Archivo | Operación | Detalle |
|---|---|---|
| `src/pages/hr/HRPermisos.tsx` | **Crear** | Módulo completo de permisos |
| `src/lib/hrConstants.ts` | **Modificar** | Agregar `PERMISSION_TYPES` array con los 7 tipos |
| `src/App.tsx` | **Modificar** | Agregar import + ruta `/hr/permisos` |
| `src/components/dashboard/DashboardSidebar.tsx` | **Modificar** | Eliminar "Licencias", activar "Permisos" → `/hr/permisos` |
| `src/pages/hr/HRAbsences.tsx` | **Modificar** | Fix filtros: `"all"` → `""` en `typeFilter` y `statusFilter` |
| `src/pages/hr/HRVacations.tsx` | **Modificar** | Fix filtro: `"all"` → `""` en `statusFilter` |

---

### Fix de lógica de filtrado tras cambio de valor vacío

Tras el cambio de `"all"` a `""`:

```tsx
// HRAbsences — filtered useMemo
const matchType = !typeFilter || a.absence_type === typeFilter;
const matchStatus = !statusFilter || a.status === statusFilter;

// HRPermisos — mismo patrón
const matchType = !typeFilter || a.absence_type === typeFilter;
const matchStatus = !statusFilter || a.status === statusFilter;
```

---

### Datos para el modal de permisos

El modal guarda en `absences` con:
- `absence_type`: valor del tipo seleccionado (ej. `"permiso_remoto"`)
- `start_date` = `end_date`: la fecha del permiso (un solo día)
- `total_days`: 1
- `notes`: el horario capturado (ej. "14:00 - 17:00")
- `reason`: el motivo ingresado
- `status`: `'pending'`

---

### Colores semánticos de badges por tipo de permiso

| Tipo | Color badge |
|---|---|
| permiso_remoto | azul/blue |
| salida_temprana | naranja/amber |
| llegada_tarde | naranja/orange |
| permiso_personal | violeta/violet |
| permiso_medico | verde/emerald |
| permiso_academico | cian/cyan |
| permiso_diligencia | rosa/rose |

---

### No requiere migración de base de datos

La tabla `absences` ya soporta cualquier `absence_type` (campo de texto libre). Los nuevos tipos de permiso se almacenan como nuevos valores en ese campo. El filtro en la query excluye tipos de ausencia ya usados por HRAbsences (`enfermedad`, `accidente`, etc.) y tipos usados por HRVacations (`vacaciones`, `dia_personal`), usando `.in("absence_type", PERMISSION_TYPES.map(t => t.value))`.
