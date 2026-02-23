

## Modulo de Onboarding de Empleados (HR)

### Objetivo

Crear la seccion de Onboarding dentro de Reclutamiento en el modulo de RRHH, siguiendo la misma estructura visual de Candidatos (KPIs, tabs por departamento, tabla/grid, filtros) y con una pagina dedicada "Iniciar Onboarding" similar a la de creadores pero con datos tipicos de RRHH.

### Paginas a crear

#### 1. Pagina principal: `/hr/onboarding` (`src/pages/hr/HROnboarding.tsx`)

Estructura identica a la captura de referencia y al patron de HRApplicants:

**Header:**
- Breadcrumbs: Empleados > Reclutamiento > Onboarding
- Titulo "Onboarding" + subtitulo "Gestion de nuevos empleados en proceso de integracion"
- Boton CTA "Iniciar Onboarding" que navega a `/hr/onboarding/nuevo`

**KPI Cards (4):**
- Total Onboarding (muted)
- Pendientes (status = pending) (primary)
- En Progreso (status = in_progress) (warning)
- Completados (status = completed) (success/accent)

**Tabs por departamento:** Todos, Ventas, LeadGen, Contenido, Marketing, Tecnologia

**Filtros:** Buscador + toggle List/Grid

**Vista Lista (tabla):**
- Columnas: Empleado (avatar+nombre), Posicion, Area (badge), Empresa, Fecha Inicio, Manager, Progreso (barra), Estado (badge)
- Acciones: Ver, Editar, Eliminar

**Vista Grid:** Tarjetas con la misma info

**Datos:** Query a `employee_onboarding` con join a `employees` (nombre, position, department), calculando progreso desde `employee_onboarding_tasks` (completadas/total)

#### 2. Pagina de creacion: `/hr/onboarding/nuevo` (`src/pages/hr/HROnboardingNew.tsx`)

Pagina dedicada con layout estandar (ArrowLeft + breadcrumbs + footer fijo).

**Formulario simplificado para RRHH (sin wizard largo, formulario directo):**

- **Seccion 1 - Seleccion de Empleado:**
  - Select/Combobox para elegir un empleado existente del directorio (solo los que no tengan onboarding activo)
  - O crear uno nuevo rapidamente (nombre + apellido + email + departamento + posicion)

- **Seccion 2 - Configuracion del Onboarding:**
  - Fecha de inicio (DateInput)
  - Buddy/Mentor asignado (Select de empleados existentes)
  - Notas iniciales (Textarea)

- **Seccion 3 - Checklist inicial (tareas predefinidas de RRHH):**
  - Checkboxes con tareas tipicas agrupadas por categoria:
    - **Documentacion:** Contrato firmado, Documento de identidad, Foto carnet, Afiliaciones (EPS/ARL/AFP)
    - **Accesos:** Cuenta de correo, Acceso a herramientas, Credenciales de plataforma
    - **Equipamiento:** Entrega de equipo, Acceso a oficina/badge
    - **Formacion:** Induccion general, Capacitacion del area, Presentacion al equipo
  - El usuario marca cuales aplican y se crean como `employee_onboarding_tasks`

**Footer fijo:** Cancelar (outline) + Iniciar Onboarding (default)

Al guardar: inserta en `employee_onboarding` + inserta las tareas seleccionadas en `employee_onboarding_tasks`, navega a `/hr/onboarding` con toast.

### Archivos a modificar/crear

| Archivo | Cambio |
|---------|--------|
| `src/pages/hr/HROnboarding.tsx` | **Nuevo** - Pagina principal con KPIs, tabs, filtros, tabla/grid |
| `src/pages/hr/HROnboardingNew.tsx` | **Nuevo** - Pagina de creacion con formulario de seleccion de empleado, configuracion y checklist |
| `src/App.tsx` | Agregar rutas `/hr/onboarding` y `/hr/onboarding/nuevo` envueltas en HRLayout + ProtectedRoute |
| `src/components/dashboard/DashboardSidebar.tsx` | Cambiar `{ title: "Onboarding", url: null }` a `{ title: "Onboarding", url: "/hr/onboarding" }` |

### Base de datos

No se requieren cambios. Las tablas `employee_onboarding` y `employee_onboarding_tasks` ya existen con la estructura necesaria (employee_id, buddy_employee_id, start_date, status, notes + tasks con category, title, description, status, position).

### Logica de progreso

El progreso se calcula como: `(tareas completadas / total tareas) * 100`. Los estados se mapean:
- `pending` -> "Pendiente" (badge gris)
- `in_progress` -> "En Progreso" (badge azul/warning)
- `completed` -> "Completado" (badge verde/success)
