

## Reorganizacion del Modulo de Capacitacion

Se reestructurara el modulo para tener una navegacion mas clara y funcional, con tabs dedicados por audiencia, filtrado por departamento, tracking real por modulos, y vistas especializadas para Chatters y Tecnologia.

---

### Nueva Estructura de Tabs (4 tabs)

1. **Asignaciones** -- Todas las asignaciones de todos los roles. Incluye filtro por departamento (Select con departamentos), filtro por estado, y buscador. Vista tabla/grid.
2. **Chatters** -- Solo asignaciones y programas donde `target_role = 'chatter'`. Muestra primero una seccion de programas disponibles (cards compactas) y debajo la tabla de asignaciones filtrada.
3. **Tecnologia** -- Mismo layout que Chatters pero filtrado por `target_role = 'technology'`. Programas de tech y sus asignaciones.
4. **Programas por Puesto** -- Catalogo completo de programas agrupados por rol (vista actual).

---

### Tabs de Chatters y Tecnologia: Layout Interno

Cada uno de estos tabs tendra dos secciones:

**Seccion superior**: Cards horizontales con los programas disponibles para ese rol (nombre, duracion, modulos, badge obligatorio). Boton para ver modulos de cada programa.

**Seccion inferior**: Tabla de asignaciones filtrada automaticamente por el rol. Mismas columnas que la tabla general pero sin necesidad de filtrar manualmente.

Esto permite ver de un vistazo que programas existen para chatters/tech y quienes los estan cursando.

---

### Filtro por Departamento (Tab Asignaciones)

Se agrega un Select de departamento al lado del filtro de estado en el tab "Asignaciones". Los departamentos se cargan de la tabla `departments`. Filtra las asignaciones por `employees.department_id`.

---

### Tracking Real por Modulos

**Nueva tabla `training_module_progress`**:

```text
training_module_progress
- id (uuid, PK)
- assignment_id (uuid, FK -> employee_training_assignments.id, ON DELETE CASCADE)
- module_id (uuid, FK -> training_modules.id, ON DELETE CASCADE)
- status (text, default 'pending') -- pending, in_progress, completed
- completed_at (timestamptz)
- score (numeric) -- para quizzes
- notes (text)
- created_at (timestamptz)
- updated_at (timestamptz)
- UNIQUE(assignment_id, module_id)
```

**Calculo de progreso**: En lugar del `progressMap` estatico actual, el progreso se calcula como `modulos_completados / total_modulos * 100`. Esto requiere un query adicional o un conteo en el frontend.

---

### Vista de Detalle de Asignacion (nuevo view: 'detail')

Al hacer clic en "Ver" (Eye) en cualquier asignacion, se abre una vista a pantalla completa con:

- Header: ArrowLeft + Nombre del empleado + Programa + Badge de estado
- Info general: empleado, programa, fechas, supervisor, notas
- Lista de modulos con checkboxes para marcar completados
- Barra de progreso general calculada en tiempo real
- Al completar todos los modulos requeridos, la asignacion se marca automaticamente como "completed"

---

### Vistas internas actualizadas

```text
currentView:
  'list'    -> Dashboard (KPIs + 4 Tabs)
  'assign'  -> Formulario asignar capacitacion
  'config'  -> Configuracion de programas
  'modules' -> Modulos de un programa
  'detail'  -> Detalle/tracking de una asignacion (NUEVO)
```

---

### Archivos a modificar/crear

| Archivo | Cambio |
|---|---|
| `src/pages/hr/HRTraining.tsx` | Agregar tab "Tecnologia", layout interno de Chatters/Tech con seccion de programas + asignaciones, filtro por departamento, vista de detalle con tracking por modulos, calculo de progreso real |
| **Migracion SQL** | Crear tabla `training_module_progress` con RLS, indice unico en (assignment_id, module_id) |

### Detalle tecnico

**Tabs de Chatters/Tecnologia**: Componente `RoleTrainingTab` reutilizable que recibe `targetRole` como prop. Internamente hace dos queries: programas filtrados por `target_role` y asignaciones filtradas por el mismo campo via join con `training_programs`.

**Progreso real**: Para cada asignacion visible en la tabla, se consultan los modulos del programa y el conteo de progreso. Se usa un query agrupado para evitar N+1:

```text
SELECT assignment_id, COUNT(*) FILTER (WHERE status = 'completed') as completed,
       COUNT(*) as total
FROM training_module_progress
WHERE assignment_id IN (...)
GROUP BY assignment_id
```

**Auto-completar asignacion**: Cuando se marca el ultimo modulo requerido como completado en la vista de detalle, se ejecuta un update automatico de la asignacion a `status = 'completed'` y `completion_date = now()`.

**Filtro por departamento**: Se reutiliza el hook `useDepartments` existente en `useEmployees.ts` para poblar el Select de departamentos. El filtrado se hace en el frontend comparando `employees.department_id`.

