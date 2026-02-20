
## Control de Asistencia — Módulo HR completo

### Análisis del estado actual

No existe una tabla `attendance` (control de asistencia) en la base de datos ni un archivo `HRAttendance.tsx`. El módulo debe construirse desde cero, incluyendo:
1. Migración SQL para crear la tabla `attendance`
2. Página `HRAttendance.tsx` con el estándar visual de la plataforma
3. Registro de la ruta `/hr/asistencia` en `App.tsx`
4. Actualización del catálogo de acciones rápidas en `HRDashboard.tsx`

---

### Referencia de diseño analizada

**Imagen 1 — Vista principal:**
- Header fijo: título "Control de asistencia" + subtítulo + botón "+ Registrar Asistencia"
- 4 KPI cards: Total Registros, Presentes, Tardanzas, Ausentes
- Tabs de departamento: Todos | Ventas | LeadGen | Contenido | Marketing | Tecnología | Recursos Humanos | Administración | Operaciones | Otros
- Fila de filtros: búsqueda + Estado (Todos) + Turno + Posición + Desde + Hasta + toggle Lista/Grid
- Tabla: Empleado | Turno | Horario | Fecha | Check-In | Check-Out | Duración | Estado | Notas
- Estados en badges: Presente (success), Tarde (warning), Ausente (destructive)

**Imagen 2 — Modal "Registrar Asistencia":**
- Header del modal fijo con título + subtítulo
- Campos: Empleado (combobox), Turno (select), Hora de Entrada (datetime-local), Hora de Salida (datetime-local), Estado (select: Presente/Tarde/Ausente), Notas (textarea)
- Footer fijo con botones: Cancelar | + Registrar Asistencia

---

### Estructura de la tabla SQL

```sql
CREATE TABLE attendance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift           text NOT NULL DEFAULT 'turno_manana',
  shift_start     time,
  shift_end       time,
  check_in        timestamptz,
  check_out       timestamptz,
  date            date NOT NULL DEFAULT CURRENT_DATE,
  status          text NOT NULL DEFAULT 'presente',  -- presente | tardanza | ausente
  notes           text,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_users_all" ON attendance FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

---

### Archivos a crear / modificar

| Archivo | Operación | Detalle |
|---|---|---|
| `supabase/migrations/YYYYMMDD_create_attendance.sql` | **Crear** | DDL de la tabla + RLS |
| `src/pages/hr/HRAttendance.tsx` | **Crear** | Página completa |
| `src/App.tsx` | **Modificar** | Agregar import + ruta `/hr/asistencia` |
| `src/pages/hr/HRDashboard.tsx` | **Modificar** | Activar "asistencia" en `ALL_ACTIONS` (quitar `soon: true` y asignar URL `/hr/asistencia`) |

---

### Detalle de `HRAttendance.tsx`

#### Layout (patrón estándar de la plataforma)

```text
<div className="flex flex-col h-full overflow-hidden">
  <header shrink-0>          ← Fijo: título + botón
  <div flex-1 overflow-auto> ← Scrolleable:
    KPI cards
    Tabs departamento
    Fila de filtros
    Tabla con header sticky
  </div>
</div>
```

#### Hook `useAttendance`

Consulta con React Query a la tabla `attendance` con join a `employees`, `departments`, `positions`. Retorna registros ordenados por `date desc`.

#### KPI Cards (patrón `DashboardMetricCard`)

| Card | Cálculo | Hover |
|---|---|---|
| Total Registros | `attendance.length` | `primary` |
| Presentes | `status === "presente"` | `success` |
| Tardanzas | `status === "tardanza"` | `warning` |
| Ausentes | `status === "ausente"` | `destructive` |

Cada una con `hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-{color}/15 hover:border-{color}/40"`.

#### Tabs de departamento

Filtro dinámico usando los departamentos cargados de Supabase más la opción "Todos". Al hacer clic en un tab, filtra la tabla y el grid por `employee.department_id`.

#### Fila de filtros

```text
[🔍 Buscar empleado...] [Estado ▾] [Turno ▾] [📅 Desde] [📅 Hasta] [≡ ⊞]
```

- Búsqueda: filtra por nombre del empleado
- Estado: Todos | Presente | Tardanza | Ausente
- Turno: Todos los turnos | Turno Mañana | Turno Tarde | Turno Noche
- Desde / Hasta: input `type="date"`
- Toggle Lista/Grid (por ahora solo lista)

#### Tabla

Columnas: Empleado (avatar iniciales + nombre en bold) | Turno | Horario (start–end) | Fecha | Check-In | Check-Out | Duración (cálculo automático) | Estado (badge semántico) | Notas

Header de tabla sticky (`sticky top-0 z-10 bg-card`) siguiendo el patrón de la plataforma.

#### Modal "Registrar Asistencia" (Dialog con layout fijo)

```text
<DialogContent className="!flex !flex-col gap-0 max-w-lg">
  <DialogHeader shrink-0>   ← Fijo: título + subtítulo
  <div flex-1 overflow-y-auto p-6 space-y-4>  ← Scrolleable
    Empleado (combobox)
    Turno (select)
    [Hora Entrada] [Hora Salida] (grid 2 cols, datetime-local)
    Estado (select)
    Notas (textarea)
  </div>
  <DialogFooter shrink-0>   ← Fijo: Cancelar | + Registrar Asistencia
</DialogContent>
```

Los campos del turno (Mañana: 08:00–16:00, Tarde: 14:00–22:00, Noche: 22:00–06:00) se auto-completan al seleccionar el turno, aunque el usuario puede sobrescribirlos.

#### Cálculo de duración

```tsx
const duration = checkIn && checkOut
  ? differenceInMinutes(new Date(checkOut), new Date(checkIn))
  : null;
const hours = Math.floor(duration / 60);
const mins  = duration % 60;
// → "9h 0m"
```

#### Lógica de estado auto-sugerido

Al ingresar la hora de check-in, si es mayor a la hora de inicio del turno en más de 10 minutos, el estado se sugiere como "tardanza". El usuario puede cambiar manualmente.

---

### Actualización de Quick Actions

En `HRDashboard.tsx`, cambiar la entrada de `asistencia`:

```ts
// Antes:
{ id: "asistencia", label: "Ver Asistencia", icon: ClipboardCheck, url: null, soon: true }

// Después:
{ id: "asistencia", label: "Control Asistencia", icon: ClipboardCheck, url: "/hr/asistencia" }
```

Y actualizar el `DEFAULT_ACTION_IDS` para incluirla en lugar de `candidatos` si se desea, o dejarla disponible en el catálogo.

---

### Badges de estado

| Status | Variante |
|---|---|
| `presente` | `success` |
| `tardanza` | `warning` |
| `ausente` | `destructive` |

