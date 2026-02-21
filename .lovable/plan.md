

## Rediseno de Evaluaciones de Desempeno: Dashboard Completo + Stepper de Evaluacion

Se reescribira completamente `HRPerformance.tsx` para alinearla con los demas modulos de RRHH (Incidentes, Capacitacion, etc.) e implementar un wizard de evaluacion de 4 pasos guiado.

---

### Vista Principal (Dashboard)

Estructura identica a HRIncidents:

```text
Header fijo: "Evaluaciones & Performance" + subtitulo + boton "+ Nueva Evaluacion"

KPI Cards (4):
  - Calif. Promedio (con icono Star)
  - Evaluaciones (total)
  - Completadas
  - Objetivos (count de goals_next_period no null)

Tab bar de departamentos: Todos | Ventas | LeadGen | Contenido | Marketing | Tecnologia | RRHH | Admin | Operaciones | Otros
  (cargado dinamicamente desde tabla departments)

Tab bar de estados: Todos | Completadas | Pendientes | Borrador
  (basado en PERFORMANCE_EVALUATION_STATUSES)

Filtros: Buscador + Select estado + DateRangePicker + Toggle vista (list/grid)

Tabla con columnas: Empleado (avatar + nombre) | Periodo | Evaluado (fecha) | Rating (score + estrellas) | Objetivos (progress bar) | Estado (badge) | Acciones (aprobar, rechazar, ver, editar)
```

---

### Wizard "Nueva Evaluacion" (4 pasos)

En lugar de un modal simple, se abre una vista full-page con stepper premium (mismo patron que EmployeeNew):

**Paso 1: Empleado y Periodo**
- EmployeeSearchCombobox para seleccionar empleado
- DateInput para "Inicio del periodo" y "Fin del periodo" (reemplazan el campo de texto "period")
- El campo `period` se calcula automaticamente como "ene 2026 - mar 2026" a partir de las fechas

**Paso 2: Categorias de Evaluacion**
- 4 categorias con sliders o inputs numericos (1-5):
  - Puntualidad
  - Calidad del Trabajo
  - Trabajo en Equipo
  - Iniciativa
- Cada categoria con descripcion guia de que evaluar
- Score general calculado automaticamente en tiempo real

**Paso 3: Feedback Cualitativo**
- Textarea "Fortalezas" con placeholder guia
- Textarea "Areas de Mejora" con placeholder guia
- Textarea "Comentarios adicionales" (opcional)

**Paso 4: Objetivos**
- Seccion para definir objetivos del proximo periodo
- Inputs dinamicos donde se pueden agregar N objetivos (boton "+ Agregar Objetivo")
- Cada objetivo: titulo + descripcion breve
- El campo `goals_next_period` se serializa como texto concatenado de todos los objetivos

**Footer fijo**: Boton "Anterior" (outline) + Boton "Siguiente" / "Crear Evaluacion" (default)

---

### Archivos a modificar/crear

| Archivo | Cambio |
|---|---|
| `src/pages/hr/HRPerformance.tsx` | Reescritura completa: layout h-screen con header fijo, KPIs, dept tabs, status tabs, filtros, DateRangePicker, vista list/grid, acciones en tabla (aprobar, rechazar, ver, editar) |
| `src/pages/hr/HRPerformanceNew.tsx` | **NUEVO** - Pagina full-page con stepper de 4 pasos para crear evaluacion siguiendo el patron de EmployeeNew |
| `src/App.tsx` | Agregar ruta `/hr/desempeno/nuevo` apuntando a HRPerformanceNew con HRLayout |

---

### Detalle tecnico

**Query con join a departments**: Se agrega join a `employees(first_name, last_name, employee_code, department_id, profile_photo_url)` para poder filtrar por departamento y mostrar avatar.

**Tab bar de departamentos**: Query independiente a `departments` (is_active=true), mismo patron que HRIncidents.

**Tab bar de estados**: Usa PERFORMANCE_EVALUATION_STATUSES con un tab "Todos" (estado vacio) y tabs individuales (completed, pending, draft, reviewed). No tiene default "Todos" seleccionado - arranca en "Todos" como primer tab visible.

**Stepper premium**: Reutiliza el mismo visual que EmployeeNew: circulos con gradiente `from-accent to-primary`, lineas de progreso, iconos descriptivos por paso (Users, BarChart3, MessageSquare, Target).

**Periodo automatico**: En el paso 1, al seleccionar inicio y fin del periodo, se genera automaticamente el string `period` formateado como "ene 2026 - mar 2026" usando `format(date, "MMM yyyy", { locale: es })`.

**Objetivos dinamicos**: Estado local `objectives: { title: string; description: string }[]` con boton para agregar y X para eliminar. Al guardar, se concatenan como texto para el campo `goals_next_period`.

**Vista Grid**: Cards con info del empleado, periodo, score con estrellas, badge de estado y acciones rapidas. Mismo patron de grid que otros modulos.

**Acciones en tabla**: 
- Checkmark verde: cambiar status a "completed"
- X roja: cambiar status a "draft" o rechazar
- Ojo: ver detalle (modal con toda la info de la evaluacion)
- Lapiz: editar (navegar al wizard con datos precargados)

**Filtro de estado sin default**: `useState("")` con placeholder "Estado" en el Select, siguiendo la convencion estandar.

