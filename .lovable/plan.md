
## Módulo "Vacaciones & Tiempo Libre" — Plan Completo

### Análisis del estado actual

- La tabla `absences` ya existe en Supabase y tiene campos genéricos (`absence_type`, `start_date`, `end_date`, `status`, `reason`, `total_days`). **Reusaremos esta tabla** filtrando por `absence_type = 'vacaciones'` y `absence_type = 'dia_personal'`.
- En el sidebar, `Vacaciones` tiene `url: null` → hay que activarla a `/hr/vacaciones`.
- En `HRDashboard.tsx`, la acción de vacaciones tiene `url: null, soon: true` → hay que actualizarla.
- En `App.tsx`, hay que registrar la nueva ruta.
- La `HRAbsences` actual cubre todos los tipos de ausencia, incluyendo vacaciones y días personales. No se modifica — sigue existiendo para el resto de tipos.

---

### Estructura de la página

Siguiendo exactamente el diseño de las imágenes de referencia y el patrón estándar de la plataforma:

```text
<div className="flex flex-col h-full overflow-hidden">
  ┌─ Header shrink-0 ──────────────────────────────────────┐
  │  "Vacaciones & Tiempo Libre"  + "+ Nueva Solicitud"    │
  └────────────────────────────────────────────────────────┘
  ┌─ flex-1 overflow-auto ─────────────────────────────────┐
  │  Tab Type: [☀️ Vacaciones Anuales] [📅 Días Personales] │
  │                                                        │
  │  KPI Cards (5 o 4 según tab)                           │
  │                                                        │
  │  Department tabs: Todos | Ventas | LeadGen | ...       │
  │                                                        │
  │  View tabs: [Solicitudes] [Balances] [Historial] [📅 Calendario] │
  │                                                        │
  │  Filter row: [🔍] [Estado ▾] [📅 Desde] [📅 Hasta] [≡ ⊞] │
  │                                                        │
  │  Tabla / Grid (sticky header)                          │
  └────────────────────────────────────────────────────────┘
</div>
```

---

### Dos tabs principales de tipo

**Tab "Vacaciones Anuales"** (`absence_type = 'vacaciones'`)
- KPIs: Total Solicitudes | Pendientes | Aprobadas | Rechazadas | Próximas
- Columnas tabla: Empleado | Tipo (badge "Vacaciones") | Período | Días | Razón | Estado | Acciones

**Tab "Días Personales"** (`absence_type = 'dia_personal'`)
- KPIs: Días Usados | Disponibles (12 - usados) | Pendientes | Este Mes
- Columnas tabla: Empleado | Tipo (badge "Personal") | Período | Días | Razón | Estado | Acciones

---

### View tabs internos (sub-navegación)

| Tab | Contenido |
|---|---|
| Solicitudes | Tabla/Grid de registros filtrados |
| Balances | Cards por empleado mostrando días disponibles/usados |
| Historial | Todas las solicitudes sin filtro de estado |
| Calendario | Vista de calendario mensual con días marcados (color azul=vacaciones, morado=personal) |

---

### KPI Cards — Vacaciones Anuales

| Card | Valor | Color |
|---|---|---|
| Total Solicitudes | `count(all)` | `primary` |
| Pendientes | `status === 'pending'` | `warning` (naranja) |
| Aprobadas | `status === 'approved'` | `success` (verde) |
| Rechazadas | `status === 'rejected'` | `destructive` (rojo) |
| Próximas | `status === 'approved' && start_date > today` | `primary` (azul) |

### KPI Cards — Días Personales

| Card | Valor | Color |
|---|---|---|
| Días Usados | Suma `total_days` aprobados este año | `primary` |
| Disponibles | `12 - días_usados` | `success` |
| Pendientes | `status === 'pending'` | `warning` |
| Este Mes | Días usados en el mes actual | `primary` |

---

### Tabla de solicitudes

Columnas estándar (sticky header, acciones a la derecha):

| Columna | Detalle |
|---|---|
| Empleado | Avatar iniciales + nombre en bold + cargo debajo |
| Tipo | Badge: "Vacaciones" (azul/blue) o "Personal" (morado/violet) |
| Período | "19 ene — al 30 ene 2026" en dos líneas |
| Días | Número |
| Razón | Texto del motivo |
| Estado | Badge: Pendiente (warning) / Aprobado (success) / Rechazado (destructive) |
| Acciones | Si `pending`: ✓ (aprobar) + ✗ (rechazar) + 👁 (ver). Si otro: solo 👁 |

---

### Vista Grid

Cards con la misma info que la tabla, diseño similar a `TicketsGrid`. Cada card:
- Avatar con iniciales + nombre + cargo
- Badge tipo + badge estado
- Período y días
- Razón (line-clamp-2)
- Acciones en el footer de la card

---

### Modal "Nueva Solicitud"

Siguiendo el patrón estándar con header y footer fijos:

```text
DialogContent "!flex !flex-col gap-0 max-w-md"
  DialogHeader shrink-0 → título dinámico según tab activo
  div flex-1 overflow-y-auto p-6 space-y-4
    Empleado (EmployeeSearchCombobox)
    Tipo de Ausencia (pre-seleccionado según tab, readonly con icono)
    Rango de Fechas (dos inputs date: Fecha Inicio + Fecha Fin en grid 2 cols)
    Motivo (Textarea)
  DialogFooter shrink-0
    Cancelar | + Crear Solicitud
```

---

### Vista Calendario

Calendario mensual interactivo:
- Navegación: `<` / `>` para cambiar mes + botón "Hoy"
- Toggle Mes / Timeline (por ahora solo Mes)
- Leyenda: 🔵 Vacaciones Anuales · 🟣 Días Personales
- Grid de días con eventos de empleados (nombre del empleado en el día)
- Panel lateral derecho: "Selecciona un día" → al hacer clic muestra los empleados con solicitudes ese día

---

### Vista Balances

Tabla compacta por empleado mostrando:
- Nombre y cargo
- Días de vacaciones usados / 15 disponibles
- Días personales usados / 12 disponibles
- Mini barra de progreso para cada tipo

---

### Archivos a crear / modificar

| Archivo | Operación |
|---|---|
| `src/pages/hr/HRVacations.tsx` | **Crear** — Página completa |
| `src/App.tsx` | **Modificar** — Agregar import + ruta `/hr/vacaciones` |
| `src/components/dashboard/DashboardSidebar.tsx` | **Modificar** — `url: null` → `url: "/hr/vacaciones"` en "Vacaciones" |
| `src/pages/hr/HRDashboard.tsx` | **Modificar** — Actualizar acción "vacaciones" con URL real |
| `src/lib/hrConstants.ts` | **Modificar** — Agregar `'dia_personal'` a constantes si falta |

No se requieren migraciones de base de datos. La tabla `absences` ya tiene todos los campos necesarios.

---

### Flujo de aprobación / rechazo

Al hacer clic en ✓ (aprobar) o ✗ (rechazar) en la tabla:
- Aprobar: `UPDATE absences SET status = 'approved', approved_by = user.id, approved_at = now()`
- Rechazar: `UPDATE absences SET status = 'rejected', approved_by = user.id, approved_at = now()`

---

### Lógica de días disponibles (Días Personales)

`disponibles = 12 - sum(total_days WHERE status = 'approved' AND absence_type = 'dia_personal' AND year = current_year)`

Para Vacaciones: `disponibles = 15 - sum(total_days WHERE status = 'approved' AND absence_type = 'vacaciones' AND year = current_year)` (estándar colombiano).

---

### Integración de tipos en hrConstants

Agregar `'dia_personal'` y `'vacaciones'` como tipos reconocidos de ausencia (ya existe `'vacaciones'` implícito, pero formalizar la constante para la UI del módulo). Se garantiza compatibilidad con `HRAbsences.tsx` que también usa estos valores.

---

### Patrón visual aplicado

- Header fijo con botón "default" (CTA primario) según estándar de plataforma
- KPI cards con `DashboardMetricCard` + hover effects semánticos
- Tabla con `sticky top-0 z-10 bg-card` en el header
- Acciones sticky a la derecha
- Badges con colores semánticos (no hardcoded)
- Toggle Lista/Grid con variante `secondary` (activo) y `ghost` (inactivo)
