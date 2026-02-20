
## Módulo de Empleados (RRHH) — Plan de Implementación

Este plan cubre la implementación completa del módulo de Recursos Humanos basado en el documento de arquitectura "Empleados 2.0", adaptado al stack y convenciones del proyecto actual (React 18, TypeScript, Supabase, Tailwind, shadcn/ui).

---

### Alcance y estrategia

El documento define 36 rutas, 29 componentes, 22 tablas y una arquitectura compleja. Para entregarlo de forma funcional, sólida y no saturar el codebase, se implementará en **fases priorizadas**:

**Fase 1 — Base estructural (este PR):**
- Migración de base de datos (13 tablas core)
- Sidebar actualizado con sección RRHH
- Rutas registradas en App.tsx
- Dashboard principal de RRHH
- Directorio de empleados (listado + alta + perfil)
- Módulos de operación diaria (Ausencias, Vacaciones, Incidentes)
- Reclutamiento (Candidatos)
- Constantes y utilidades centralizadas

---

### Base de datos — 13 tablas (migración única)

Las tablas se crean en este orden para respetar dependencias:

```text
1. departments
2. positions
3. employees  (central — self-join + FK a departments/positions/profiles)
4. absences
5. overtime
6. time_bank + time_bank_balances
7. employee_incidents
8. employee_deductions
9. performance_evaluations
10. applicants
11. employee_onboarding + employee_onboarding_tasks
12. employee_offboarding
13. employee_documents
14. training_programs + employee_training_assignments
```

Todas con RLS habilitado y políticas permisivas para usuarios autenticados (igual que el resto del sistema). La tabla `employees` incluye el trigger `generate_employee_code` (auto-código por departamento).

Se **omiten** tablas de `shifts` y `attendance` en esta primera fase por su complejidad de modelo de turnos rotativos — quedarán como Fase 2.

---

### Estructura de archivos

```text
src/
  lib/
    hrConstants.ts          ← Constantes centralizadas del documento
    hrAreaUtils.ts          ← Mapeo departamento→área→color
  hooks/
    useEmployees.ts         ← Listado de empleados con join
    useEmployee.ts          ← Empleado individual por ID
  pages/
    hr/
      HRDashboard.tsx       ← Dashboard principal RRHH (KPIs, distribuciones)
      EmployeeDirectory.tsx ← Directorio con filtros y tab bar
      EmployeeNew.tsx       ← Formulario de alta multi-sección
      EmployeeProfile.tsx   ← Perfil con tabs (Info, Documentos, Evaluaciones, etc.)
      HRAbsences.tsx        ← Gestión de ausencias
      HRIncidents.tsx       ← Registro de incidentes laborales
      HRApplicants.tsx      ← Pipeline de candidatos
      HRTraining.tsx        ← Programas de capacitación
      HRPerformance.tsx     ← Evaluaciones de desempeño
  components/
    hr/
      HRPageHeader.tsx      ← Header estándar HR (título + acciones)
      HRMetricCard.tsx      ← KPI card para dashboards
      EmployeeStatusBadge.tsx
      EmployeeAreaBadge.tsx
      EmployeeSearchCombobox.tsx
```

---

### Rutas a registrar en App.tsx

Se adaptan las rutas del documento al prefijo `/hr` (sin `/app`) para consistencia con el resto del sistema:

| Ruta | Página |
|---|---|
| `/hr` | HRDashboard |
| `/hr/directorio` | EmployeeDirectory |
| `/hr/empleado/nuevo` | EmployeeNew |
| `/hr/empleado/:id` | EmployeeProfile |
| `/hr/ausencias` | HRAbsences |
| `/hr/incidentes` | HRIncidents |
| `/hr/candidatos` | HRApplicants |
| `/hr/capacitacion` | HRTraining |
| `/hr/desempeno` | HRPerformance |

---

### Sidebar — Nueva sección RRHH

Se agrega en `DashboardSidebar.tsx` un grupo colapsable **"RRHH"** entre Operaciones y Administración con icono `UserCog`, con sub-items: Dashboard, Directorio, Ausencias, Incidentes, Candidatos.

---

### Páginas a implementar

**HRDashboard** — Métricas KPI (total empleados, activos, en licencia, vacantes) + distribución por departamento + contrataciones recientes.

**EmployeeDirectory** — Tabla/grid de empleados con búsqueda, filtro por departamento/estado, badge de área colorido, y botón "Nuevo Empleado".

**EmployeeNew** — Formulario multi-sección con react-hook-form + zod: datos personales, datos laborales (departamento, cargo, contrato), seguridad social (EPS, ARL, AFP), datos bancarios.

**EmployeeProfile** — Página con tabs: Info general | Documentos | Evaluaciones | Capacitación | Incidentes | Historial.

**HRAbsences** — Listado de ausencias con estado (pendiente/aprobada/rechazada), botón de aprobar/rechazar inline, filtro por tipo.

**HRIncidents** — Registro de incidentes por empleado con severidad (Baja/Media/Alta/Crítica), estado (abierto/cerrado), y acción correctiva.

**HRApplicants** — Pipeline kanban-style con columnas por estado (Postulado → Revisión → Entrevista → Oferta → Contratado/Rechazado).

**HRTraining** — Listado de programas de capacitación asignados con barra de progreso y estado.

**HRPerformance** — Evaluaciones de desempeño periódicas con calificación y scores.

---

### Componentes compartidos HR

- `HRPageHeader` — Header con título, subtítulo y slot de acciones (igual que el patrón del resto del sistema)
- `HRMetricCard` — KPI card con icono, valor, trend y color
- `EmployeeStatusBadge` — Badge de estado (Activo/Inactivo/En Licencia/Suspendido)
- `EmployeeAreaBadge` — Badge colorido por área/departamento
- `EmployeeSearchCombobox` — Combobox para seleccionar empleado en formularios

---

### Constantes y utilidades

- `src/lib/hrConstants.ts` — Todos los arrays de opciones del documento: CONTRACT_TYPES, WORK_MODALITIES, EMPLOYEE_STATUS_OPTIONS, ABSENCE_TYPES, INCIDENT_SEVERITIES, INCIDENT_TYPES, APPLICANT_STATUSES, APPLICANT_SOURCES, EPS_OPTIONS, ARL_OPTIONS, AFP_OPTIONS, DEDUCTION_TYPES, PERFORMANCE_RATINGS, OVERTIME_TYPES, LEAVE_TYPES
- `src/lib/hrAreaUtils.ts` — AREA_COLORS y función getDepartmentArea

---

### Resumen de archivos a crear/modificar

| Acción | Archivo |
|---|---|
| Migración BD | supabase/migrations/YYYYMMDD_hr_module.sql |
| Modificar | src/App.tsx (rutas HR) |
| Modificar | src/components/dashboard/DashboardSidebar.tsx |
| Crear | src/lib/hrConstants.ts |
| Crear | src/lib/hrAreaUtils.ts |
| Crear | src/hooks/useEmployees.ts |
| Crear | src/hooks/useEmployee.ts |
| Crear | src/components/hr/HRPageHeader.tsx |
| Crear | src/components/hr/HRMetricCard.tsx |
| Crear | src/components/hr/EmployeeStatusBadge.tsx |
| Crear | src/components/hr/EmployeeAreaBadge.tsx |
| Crear | src/components/hr/EmployeeSearchCombobox.tsx |
| Crear | src/pages/hr/HRDashboard.tsx |
| Crear | src/pages/hr/EmployeeDirectory.tsx |
| Crear | src/pages/hr/EmployeeNew.tsx |
| Crear | src/pages/hr/EmployeeProfile.tsx |
| Crear | src/pages/hr/HRAbsences.tsx |
| Crear | src/pages/hr/HRIncidents.tsx |
| Crear | src/pages/hr/HRApplicants.tsx |
| Crear | src/pages/hr/HRTraining.tsx |
| Crear | src/pages/hr/HRPerformance.tsx |

---

### Notas de compatibilidad

- Todas las dependencias NPM que requiere el módulo ya están instaladas en el proyecto.
- El módulo sigue exactamente los mismos patrones de layout, tabs, modales, KPIs y toast del resto del sistema (Creadores, Eventos, Contactos).
- Las tablas `shifts` y `attendance` (asistencia diaria con turnos) se dejan para Fase 2 por su mayor complejidad operativa.
- La tabla `time_permissions` (permisos de tiempo) también se deja para Fase 2.
