

## Plan: Stepper wizard para HR Onboarding y Offboarding

### Contexto

Actualmente `HROnboardingNew.tsx` y `HROffboardingNew.tsx` usan un diseño de Cards apiladas sin stepper. El usuario quiere una experiencia tipo wizard con stepper premium (como el de creadores), incluyendo campos financieros adicionales y lógica de integración con nómina.

### Cambios en Base de Datos

**Migración SQL**: Agregar columnas faltantes en `employees`:

```sql
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS cost_center text,
  ADD COLUMN IF NOT EXISTS hour_bank_enabled boolean DEFAULT false;
```

La tabla `employees` ya tiene: `base_salary`, `bank_name`, `bank_account_number`, `bank_account_type`. No se requieren más columnas.

---

### Onboarding — `HROnboardingNew.tsx` (reescritura completa)

**Stepper de 3 pasos** con el diseño premium (gradiente `from-accent to-primary`, halo en paso activo, `Progress` bar):

| Paso | Contenido |
|------|-----------|
| **1. Empleado y Configuración** | Selector de empleado, fecha de inicio, buddy/mentor, notas iniciales |
| **2. Datos Financieros** | Salario Base (Input numérico), Centro de Costo (Select con opciones de `useCostCenters`), Datos Bancarios (banco, cuenta, tipo de cuenta), Toggle "Activar Banco de Horas" |
| **3. Checklist de Onboarding** | El checklist actual agrupado por categorías con selección masiva |

**Al guardar (handleSubmit)**:
1. Insertar `employee_onboarding` y `employee_onboarding_tasks` (como ahora)
2. Actualizar `employees` con: `base_salary`, `cost_center`, `bank_name`, `bank_account_number`, `bank_account_type`, `hour_bank_enabled`
3. Si `hour_bank_enabled`, insertar un registro inicial en `hour_bank` con `hours: 0`, `movement_type: 'deposito'`, `reason: 'Apertura de banco de horas'`

**Validaciones**:
- Paso 1: Empleado obligatorio
- Paso 2: Salario base obligatorio y > 0, banco y cuenta obligatorios
- Paso 3: Al menos 1 tarea seleccionada

---

### Offboarding — `HROffboardingNew.tsx` (reescritura completa)

**Stepper de 3 pasos**:

| Paso | Contenido |
|------|-----------|
| **1. Empleado y Terminación** | Selector de empleado, tipo de terminación, fecha de terminación, fecha entrevista de salida |
| **2. Motivo y Resumen Financiero** | Selector de "Motivo de Salida" (categorizado: Mejor oferta, Problemas personales, Rendimiento, Reestructuración, Fin de contrato, Otro), Textarea con detalle del motivo. **Resumen automático**: al seleccionar empleado, consultar `hour_bank` para mostrar balance de horas pendientes, y mostrar salario base del empleado |
| **3. Checklist de Offboarding** | El checklist actual + botón "Descargar Liquidación Proyectada" |

**Botón "Descargar Liquidación Proyectada"**:
- Genera un PDF con jsPDF que incluye:
  - Nombre del empleado, fecha de ingreso, fecha de terminación
  - Días trabajados en el último periodo
  - Salario base pendiente (proporcional)
  - Vacaciones pendientes (calculadas: días acumulados - días tomados de `absences` tipo `vacacion_anual`)
  - Horas pendientes en banco de horas (balance × valor hora de `financial_config`)
  - **Total Liquidación Proyectada**

**Al guardar**:
1. Insertar `employee_offboarding` y `employee_offboarding_tasks` (como ahora)
2. Actualizar `employees.status` a `'inactivo'` y `termination_date`

---

### Archivos a modificar/crear

| Archivo | Cambio |
|---------|--------|
| `supabase/migrations/xxx.sql` | Agregar `cost_center` y `hour_bank_enabled` a `employees` |
| `src/pages/hr/HROnboardingNew.tsx` | Reescritura completa con stepper de 3 pasos y campos financieros |
| `src/pages/hr/HROffboardingNew.tsx` | Reescritura completa con stepper de 3 pasos, resumen financiero y botón de liquidación |
| `src/pages/hr/generateSettlementPdf.ts` | Nuevo archivo para generar el PDF de liquidación proyectada |

### Detalles de UX

- Stepper premium con gradiente `from-accent to-primary` y `Progress` bar (idéntico al de creadores)
- Layout fijo: header y footer `shrink-0`, contenido central `flex-1 overflow-auto`
- Botones "Anterior" / "Siguiente" en el footer con validación por paso
- Inputs con `Label` + asterisco rojo para campos obligatorios
- Toggle de Banco de Horas usando el componente `Switch` de Shadcn
- El resumen financiero del offboarding se carga dinámicamente al seleccionar el empleado

