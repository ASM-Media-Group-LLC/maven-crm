

## Integración bidireccional Finanzas ↔ Recursos Humanos

Actualmente ambos módulos operan en silos parciales. HR tiene datos de empleados, asistencia, horas extra y deducciones. Finanzas tiene nómina, comisiones, facturación e invoices. La conexión entre ambos es limitada: solo `ControlFinancieroPage` consulta empleados, y `useNomina` carga empleados activos. Falta visibilidad cruzada para que cada módulo muestre el contexto del otro.

---

### Análisis del estado actual

**Finanzas consume de HR:**
- `ControlFinancieroPage` → `employees` (salario, nombre) para tab Productividad
- `useNomina` → `employees` (para cálculo de nómina)
- `HorasVariablesPage` → `payroll_details` con relación a `employees`

**HR consume de Finanzas:**
- `EmployeeProfile` → `hour_bank` (balance), `absences` (vacaciones) — pero NO consulta nómina, comisiones ni deducciones financieras
- `HRHourBank` → tabla `hour_bank` directamente
- `HRDeductions` → tabla `employee_deductions`
- `HRDashboard` → NO muestra ningún dato financiero

**Gaps identificados:**
1. El perfil del empleado no muestra su historial de nómina ni comisiones
2. El dashboard de HR no tiene KPIs financieros (costo de nómina, promedio salarial)
3. Finanzas Dashboard no muestra headcount ni costo por empleado desde HR
4. Las deducciones de HR no se reflejan en la vista de nómina de Finanzas
5. Collections no cruza datos con empleados asignados a creadoras
6. Reportes no agrupan costos por departamento (dato de HR)

---

### Cambios propuestos

**1. Perfil del Empleado — Nueva tab "Finanzas"** (`EmployeeProfile.tsx`)
- Agregar una tab "Finanzas" después de "Control de Tiempo"
- Contenido en 3 cards:
  - **Nómina**: Últimos 5 periodos donde el empleado tiene `payroll_details`, mostrando periodo, bruto, neto, status
  - **Comisiones**: Comisiones asociadas al `employee_id`, mostrando periodo, tipo, monto estimado, monto final, status
  - **Deducciones**: Deducciones del empleado, mostrando tipo, monto, mes, status
- Query: `payroll_details` filtrado por `employee_id` con join a `payroll_periods`, `commissions` filtrado por `employee_id`, `employee_deductions` filtrado por `employee_id`
- Links "Ver detalle" que navegan a `/finanzas/nomina`, `/finanzas/horas-variables` y `/hr/deducciones`

**2. Dashboard HR — KPIs financieros** (`HRDashboard.tsx`)
- Agregar un nuevo bloque "Resumen Financiero de Personal" después de "Rotación y Retención"
- 4 mini-cards:
  - Costo Total Nómina: sum de `payroll_periods.net_total` del mes actual
  - Salario Promedio: promedio de `employees.base_salary` de activos
  - Deducciones Pendientes: count de `employee_deductions` con status `pending`
  - Horas Extra Acumuladas: sum de horas del `hour_bank` con `movement_type = deposit`
- Cada card tiene link a la sección correspondiente de Finanzas

**3. Dashboard Finanzas — KPIs de personal** (`FinanzasDashboard.tsx`)
- Agregar un nuevo bloque "Headcount y Costos de Personal" después del chart "Flujo de Dinero"
- 4 mini-cards:
  - Empleados Activos: count de `employees` con status `activo`
  - Costo Promedio/Empleado: `net_total` de nómina / headcount
  - Deducciones Acumuladas: sum de `employee_deductions` del mes
  - Departamentos: count distinct de departamentos con empleados activos
- Query adicional: `employees` (count, status) y `employee_deductions` (sum del mes)

**4. Nómina — Mostrar deducciones de HR** (`NominaPage.tsx`)
- En el modal de "Ver" periodo (ya existe `viewItem`), agregar una sección "Deducciones Aplicadas" que muestre las deducciones de HR (`employee_deductions`) del mismo `month_year` que el periodo
- Query: `employee_deductions` filtradas por `month_year` matching el periodo seleccionado

**5. Control Financiero — Costos por Departamento** (`ControlFinancieroPage.tsx`)
- En el tab "Costos por CC", agregar una subtabla o alternar con "Costos por Departamento"
- Query: cruzar `employees.department_id` con `departments.name` y `employees.base_salary` para agrupar costo salarial por departamento
- Ya tiene la query de `employees`, solo falta joinear con `departments`

**6. Reportes — Costo por Departamento** (`ReportesPage.tsx`)
- En la tab "Estado de Cuenta CC", agregar una sección que agrupe costos por departamento usando la tabla `employees` + `departments`
- Mostrar: Departamento, # Empleados, Costo Salarial Total, % del Total

**7. Hooks de integración** (`useEmployee.ts`)
- Agregar 2 hooks nuevos:
  - `useEmployeePayrollHistory(employeeId)` → consulta `payroll_details` + `payroll_periods` filtrado por `employee_id`
  - `useEmployeeCommissions(employeeId)` → consulta `commissions` filtrado por `employee_id`
- Estos hooks se usan en el perfil del empleado

---

### Resumen de archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/hooks/useEmployee.ts` | Agregar `useEmployeePayrollHistory` y `useEmployeeCommissions` |
| `src/pages/hr/EmployeeProfile.tsx` | Nueva tab "Finanzas" con nómina, comisiones y deducciones del empleado |
| `src/pages/hr/HRDashboard.tsx` | Bloque "Resumen Financiero de Personal" con 4 KPIs de Finanzas |
| `src/pages/finanzas/FinanzasDashboard.tsx` | Bloque "Headcount y Costos de Personal" con 4 KPIs de HR |
| `src/pages/finanzas/nomina/NominaPage.tsx` | Sección "Deducciones" en modal de ver periodo |
| `src/pages/finanzas/control/ControlFinancieroPage.tsx` | Subtab "Por Departamento" en Costos, con query a departments |
| `src/pages/finanzas/reportes/ReportesPage.tsx` | Sección costo por departamento en tab Estado de Cuenta CC |

No se crean tablas nuevas. No se modifican rutas. Todos los datos ya existen en las tablas actuales, solo falta cruzarlos.

