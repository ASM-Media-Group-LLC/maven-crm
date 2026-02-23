

## Rediseno de la pagina de Candidatos y Nuevo Candidato

### Objetivo

Reemplazar la vista actual de Kanban + modal por una estructura profesional que sigue los patrones establecidos: pagina de listado con KPIs, tabla/grid, filtros y una pagina dedicada para crear nuevos candidatos (en lugar de un modal).

### Cambios planificados

#### 1. Pagina principal de Candidatos (`src/pages/hr/HRApplicants.tsx`) - Rediseno completo

**Header:**
- Titulo "Candidatos" con subtitulo "Gestiona candidatos y conviertelos en empleados"
- Breadcrumbs: Empleados > Reclutamiento > Candidatos
- Boton CTA "Nuevo Candidato" (variante default) que navega a `/hr/candidatos/nuevo`

**KPI Cards (4 tarjetas):**
- Total Candidatos (muted)
- Pendientes (filtro: applied + reviewing) (primary)
- En Entrevista (filtro: interview) (warning)
- Aprobados/Contratados (filtro: hired) (success)

**Pestanas de departamento:**
- Todos, Ventas, LeadGen, Contenido, Marketing, Tecnologia (filtrado por `departments.name`)

**Filtros:**
- Buscador por nombre, email o posicion
- Select de estado (Todos, Postulado, En Revision, Entrevista, Oferta, Contratado, Rechazado)
- Toggle List/Grid

**Vista Lista (tabla):**
- Columnas: Nombre (con avatar iniciales), Email, Posicion, Area (badge), Fuente, Fecha, Estado (badge con dropdown para cambiar), Acciones (Ver, Editar, Eliminar)
- Header sticky, columna acciones sticky right
- Ordenacion estandar

**Vista Grid:**
- Tarjetas con nombre, posicion, area, fuente, fecha y estado

**Modales:**
- ViewApplicantModal: para ver detalles completos
- EditApplicantModal: para editar inline
- DeleteApplicantDialog: confirmacion de eliminacion

#### 2. Nueva pagina Nuevo Candidato (`src/pages/hr/HRApplicantNew.tsx`)

**Layout:**
- Pagina completa con `h-screen overflow-hidden`
- Breadcrumbs: Empleados > Reclutamiento > Nuevo Candidato
- Boton ArrowLeft ghost para volver a `/hr/candidatos`
- Header: "Nuevo Candidato" con subtitulo "Agrega un nuevo candidato al proceso de reclutamiento"

**Formulario (dentro de Card):**
- Nombre completo * (Input) + Email * (Input) en grid 2 cols
- Telefono con `PhoneInput` (selector de pais + numero)
- Posicion * (Select desde tabla `positions`)
- Fuente de reclutamiento (Select con APPLICANT_SOURCES)
- Notas (Textarea)

**Footer fijo:**
- Separador horizontal
- Botones: Cancelar (outline) + Guardar Candidato (default con icono Plus)
- Al guardar exitosamente: navegar a `/hr/candidatos` con toast

#### 3. Rutas nuevas en App.tsx

- `/hr/candidatos/nuevo` -> `HRApplicantNew` envuelto en `HRLayout` y `ProtectedRoute`

### Detalle tecnico

| Archivo | Cambio |
|---------|--------|
| `src/pages/hr/HRApplicants.tsx` | Rediseno completo: eliminar Kanban y modal, implementar layout estandarizado con KPIs, tabs, filtros, tabla/grid con acciones Ver/Editar/Eliminar, modales de detalle |
| `src/pages/hr/HRApplicantNew.tsx` | **Nuevo archivo** - Pagina dedicada con formulario de creacion, breadcrumbs, PhoneInput, Select de posicion, footer fijo con botones |
| `src/App.tsx` | Agregar ruta `/hr/candidatos/nuevo` |

### Patron de referencia

Se sigue exactamente el patron de `HRIncidents.tsx` (lista) + `HRIncidentNew.tsx` (formulario en pagina separada): header con titulo text-xl, KPIs con iconos y colores semanticos, buscador + filtros + toggle vista, tabla con acciones estandarizadas, y pagina de creacion con ArrowLeft + breadcrumbs + formulario + footer fijo.

No se requieren cambios en base de datos ni nuevas dependencias.

