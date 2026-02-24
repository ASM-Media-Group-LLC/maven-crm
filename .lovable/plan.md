

## Empleados Activos - HUB 360 del Empleado

### Resumen

Transformar la seccion actual de "Directorio de Empleados" en un HUB 360 de empleados activos, con una vista principal mejorada (filtros avanzados, columnas enriquecidas) y una ficha de empleado reestructurada en pestanas funcionales que consumen datos de otros modulos sin duplicar logica.

---

### 1. Base de datos - Nueva tabla `employee_history`

Se necesita una tabla para registrar cambios contractuales, movimientos internos y ajustes del empleado.

```text
employee_history
  id               uuid PK
  employee_id      uuid FK -> employees.id
  change_type      text (promotion, transfer, contract_change, salary_adjustment, status_change, modality_change)
  field_changed    text (position_id, department_id, contract_type, work_modality, status, base_salary, reports_to)
  old_value        text
  new_value        text
  effective_date   date
  reason           text (nullable)
  notes            text (nullable)
  created_by       uuid (nullable)
  created_at       timestamptz default now()
```

RLS: Permisiva para usuarios autenticados (mismo patron que el resto del modulo HR).

---

### 2. Vista Principal - Empleados Activos (`EmployeeDirectory.tsx`)

Mejoras sobre la pagina actual:

**Header:**
- Titulo cambia a "Empleados Activos"
- Subtitulo: "Hub de gestion del equipo activo"
- CTA: "Nuevo Empleado" (se mantiene)

**KPIs (4):**
- Total Activos (empleados con status=activo)
- Remotos (work_modality=remoto)
- Hibridos (work_modality=hibrido)
- Presenciales (work_modality=presencial)

**Filtros avanzados (nueva fila):**
- Busqueda global (existente)
- Filtro por Estado (existente)
- Filtro por Modalidad (nuevo: Remoto/Hibrido/Presencial)
- Filtro por Tipo de Contrato (nuevo: Indefinido/Fijo/etc.)
- Toggle List/Grid (existente)

**Tabs por departamento:** Se mantienen igual.

**Tabla mejorada - columnas:**
- Empleado (avatar + nombre + email) - existente
- Codigo - existente
- Area (badge) - existente
- Cargo - existente
- Modalidad (badge con icono) - nuevo
- Contrato - existente
- Ingreso - existente
- Estado (badge) - existente
- Acciones (Ver perfil, Editar, Cambiar estado) - mejorado

**Accion "Cambiar Estado":** Abre un modal rapido que permite cambiar el estado del empleado (activo, en_licencia, suspendido, etc.) con motivo obligatorio. El cambio se registra automaticamente en `employee_history`.

---

### 3. Ficha 360 del Empleado (`EmployeeProfile.tsx`)

Reestructuracion completa de las pestanas actuales:

**Header:** Se mantiene el patron actual (ArrowLeft + nombre + badges).

**Pestanas nuevas:**

| Pestana | Contenido | Fuente de datos |
|---------|-----------|-----------------|
| Resumen | Cargo, Area, Supervisor, Ingreso, Contrato, Modalidad, Contacto | `employees` + joins |
| Info Laboral | Jornada, Centro de costos (department), Contrato detallado, Seguridad social, Datos bancarios, Contacto emergencia | `employees` |
| Control de Tiempo | Resumen asistencia (ultimos 30 dias), Saldo banco de horas, Vacaciones acumuladas - todo solo lectura con links a los modulos | `attendance`, `hour_bank`, `absences` (queries de resumen) |
| Desempeno | Evaluaciones con score, Metas activas - solo lectura con link al modulo | `performance_evaluations` |
| Documentos | Lista de documentos con carga | `employee_documents` |
| Historial | Timeline de cambios: cargo, departamento, contrato, estado, movimientos internos | `employee_history` (nueva tabla) |
| Acceso | Vinculacion con usuario de plataforma (existente) | `profiles`, `user_roles` |

**Tab "Control de Tiempo" (solo lectura, consumo cruzado):**
- Card "Asistencia Reciente": query de ultimos 30 dias de `attendance` donde employee_id = X, mostrando dias presentes, tardanzas, ausencias en mini-KPIs. Boton "Ver detalle" navega a `/hr/asistencia`.
- Card "Banco de Horas": query de saldo actual de `hour_bank` (SUM de deposits - withdrawals). Boton "Ver detalle" navega a `/hr/horarios/banco-horas`.
- Card "Vacaciones": query de `absences` donde absence_type='vacaciones' y status='approved' en el ano actual, mostrando dias tomados vs 15 disponibles. Boton "Ver detalle" navega a `/hr/vacaciones`.

**Tab "Historial" (nueva):**
- Timeline cronologica descendente de `employee_history`
- Cada entrada muestra: fecha, tipo de cambio (badge), campo modificado, valor anterior -> valor nuevo, notas
- Boton para registrar un cambio manual (modal con: tipo, campo, valores, fecha efectiva, motivo)

---

### 4. Archivos a crear/modificar

| Archivo | Accion |
|---------|--------|
| **Migracion SQL** | Crear tabla `employee_history` con RLS |
| `src/hooks/useEmployee.ts` | Agregar `useEmployeeHistory`, `useEmployeeAttendanceSummary`, `useEmployeeHourBankBalance`, `useEmployeeVacationBalance`, `useCreateEmployeeHistory` |
| `src/lib/hrConstants.ts` | Agregar constantes `HISTORY_CHANGE_TYPES`, `HISTORY_FIELD_LABELS` |
| `src/pages/hr/EmployeeDirectory.tsx` | Mejorar KPIs (modalidad), agregar filtros (modalidad, contrato), agregar columna modalidad, agregar accion "Cambiar Estado" con modal |
| `src/pages/hr/EmployeeProfile.tsx` | Reestructurar pestanas: Resumen, Info Laboral, Control de Tiempo, Desempeno, Documentos, Historial, Acceso |

---

### 5. Logica clave

**Cambio de estado con historial automatico:**
Cuando se cambia el estado de un empleado (desde el modal en la vista principal o desde la ficha), se ejecutan 2 operaciones:
1. UPDATE en `employees` (campo `status`)
2. INSERT en `employee_history` (change_type='status_change', field_changed='status', old/new values)

**Consumo cruzado sin duplicacion:**
Las queries de Control de Tiempo en la ficha 360 son SELECT de solo lectura sobre tablas existentes (`attendance`, `hour_bank`, `absences`). No se crean componentes de gestion, solo cards de resumen con navegacion al modulo correspondiente.

**Sin calculos de nomina:**
Se muestra salario base como dato informativo (solo lectura), sin calculos de deducciones ni liquidaciones.

