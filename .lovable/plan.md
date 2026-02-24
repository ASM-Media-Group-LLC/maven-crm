

## Modulo de Finanzas -- Plan de Implementacion

Este modulo se construira como una extension natural del sistema, siguiendo exactamente los mismos patrones de layout, filtros, tablas, KPIs y navegacion que ya existen en HR, Creadores e Incidentes.

---

### Arquitectura de Navegacion

```text
Sidebar -> Finanzas (icono: Wallet)
  |-- Dashboard Financiero   /finanzas
  |-- Nomina                 /finanzas/nomina
  |-- Facturacion            /finanzas/facturacion
  |-- Comisiones             /finanzas/comisiones
  |-- Control Financiero     /finanzas/control
  |-- Reportes               /finanzas/reportes
```

Se usara el mismo patron de collapsible/dropdown del sidebar que HR y Creadores.

---

### Fase 1: Infraestructura Base

**Base de datos (migracion SQL)**

Se crearan las siguientes tablas:

**`payroll_periods`** -- Periodos de nomina
- id, period_name (ej. "2026-02-Q1"), start_date, end_date, total_employees, gross_total, net_total, status (borrador/calculado/cerrado/pagado), cost_center, area, notes, calculated_at, closed_at, paid_at, created_by, created_at, updated_at

**`payroll_details`** -- Detalle por empleado dentro de un periodo
- id, payroll_period_id (FK), employee_id (FK), base_salary, overtime_amount, overtime_hours, hour_bank_hours, hour_bank_amount, commission_amount, deductions_total, gross_total, net_total, notes, created_at

**`invoices`** -- Facturas a creadores
- id, invoice_number (auto-increment text), creator_id, amount, fee_amount, fee_type (paypal/standard/none), net_amount, payment_method, status (borrador/enviada/pagada/vencida/reversada), due_date, paid_date, notes, reversal_reason, created_by, created_at, updated_at

**`commissions`** -- Comisiones de empleados sobre creadores
- id, employee_id, creator_id, period (text "2026-02"), base_amount, percentage, estimated_amount, final_amount, status (proyectado/confirmado/pagado), area, cost_center, notes, created_by, created_at, updated_at

**`financial_reports`** -- Reportes generados
- id, report_type (nomina/facturacion/comisiones/consolidado), period_from, period_to, area, cost_center, file_url, format (csv/excel), generated_by, created_at

Todas las tablas con RLS `true` para usuarios autenticados (mismo patron que el resto del sistema) y trigger `update_updated_at_column`.

---

### Fase 2: Layout y Sidebar

**Archivo:** `src/pages/finanzas/FinanzasLayout.tsx`
- Replica exacta de `HRLayout.tsx`: SidebarProvider + DashboardSidebar + DashboardTopbar + children

**Archivo:** `src/components/dashboard/DashboardSidebar.tsx`
- Agregar grupo "Finanzas" con icono `Wallet` despues del grupo de Recursos Humanos
- Submenu con collapsible (mismo patron que HR):
  - Dashboard Financiero
  - Nomina
  - Facturacion
  - Comisiones
  - Control Financiero
  - Reportes

---

### Fase 3: Nomina (`/finanzas/nomina`)

**Archivos:**
- `src/pages/finanzas/nomina/NominaPage.tsx` -- Pagina principal
- `src/pages/finanzas/nomina/useNomina.ts` -- Hook CRUD

**Estructura (identica a HRDeductions/HRApplicants):**

1. **Header fijo**: Titulo "Nomina", descripcion contextual, botones "Calcular Nomina" (default) + "Crear Batch" (outline)
2. **4 KPI Cards** (DashboardMetricCard):
   - Total Periodos | Borradores | Monto Bruto Total | Monto Neto Total
3. **Tabs de area** (inline-flex border bg-muted/50 p-1 -- mismo patron)
4. **Filtros** (misma fila): Buscador + Select Estado (Borrador/Calculado/Cerrado/Pagado) + DateRangePicker + Toggle Lista/Grid
5. **Tabla** (sticky header + sticky acciones):
   - Periodo | Total Empleados | Total Bruto | Total Neto | Estado | Acciones (Ver/Eliminar)
6. **Grid view** alternativa con Cards
7. **Dialog de detalle** (drawer lateral): Breakdown por empleado, horas extra, banco de horas, comision laboral, historial

---

### Fase 4: Facturacion (`/finanzas/facturacion`)

**Archivos:**
- `src/pages/finanzas/facturacion/FacturacionPage.tsx`
- `src/pages/finanzas/facturacion/useFacturacion.ts`

**Estructura:**

1. **Header**: "Facturacion", boton "Crear Invoice" (default)
2. **4 KPIs**: Total Invoices | Pendientes de Pago | Monto Total | Fee Total
3. **Tabs por metodo de pago** (PayPal, Transferencia, Crypto, Otro)
4. **Filtros**: Buscador + Estado (borrador/enviada/pagada/vencida/reversada) + DateRangePicker + Toggle vista
5. **Tabla**:
   - Numero | Creador (con avatar initials) | Monto | Fee | Total Neto | Estado (badges) | Fecha Vencimiento | Acciones
6. **Acciones**: Ver (Eye), Editar (Pencil), Eliminar (Trash2), Reversar (RotateCcw)
7. **Modal crear/editar invoice**: Dialog con campos: Creador (select desde `creators`), Monto, Fee, Metodo de pago, Fecha de vencimiento, Notas

---

### Fase 5: Comisiones (`/finanzas/comisiones`)

**Archivos:**
- `src/pages/finanzas/comisiones/ComisionesPage.tsx`
- `src/pages/finanzas/comisiones/useComisiones.ts`

**Estructura:**

1. **Header**: "Comisiones", boton "Nueva Comision" (default)
2. **4 KPIs**: Total Registros | Proyectadas | Confirmadas | Monto Estimado Total
3. **Tabs internas** (En Tiempo Real / Proyeccion / Historial Batch) -- usando el mismo patron inline-flex de tabs
4. **Filtros**: Buscador + Empleado + Periodo + Area + Toggle vista
5. **Tabla**:
   - Empleado | Creador | Base | % | Comision Estimada | Comision Final | Estado | Acciones
6. **Badges de estado**: proyectado (azul), confirmado (verde), pagado (morado)

---

### Fase 6: Control Financiero (`/finanzas/control`)

**Archivos:**
- `src/pages/finanzas/control/ControlFinancieroPage.tsx`

**Estructura:**

1. **Header**: "Control Financiero", sin CTA principal (vista analitica)
2. **Filtros horizontales**: DateRangePicker + Selector Centro de Costo + Area
3. **4 KPI Cards**: Ingresos Totales | Egresos Totales | Balance | Variacion vs Mes Anterior
4. **Tabla comparativa mensual**: Concepto | Mes Anterior | Mes Actual | Variacion (%) | Estado
5. **Selector de centro de costo** como tabs

No se implementara logica contable compleja. Es una vista informativa basada en las tablas de nomina, facturacion y comisiones.

---

### Fase 7: Reportes (`/finanzas/reportes`)

**Archivos:**
- `src/pages/finanzas/reportes/ReportesPage.tsx`
- `src/pages/finanzas/reportes/useReportes.ts`

**Estructura:**

1. **Header**: "Reportes", boton "Generar Reporte" (default)
2. **Filtros**: DateRangePicker + Tipo de reporte (Select: Nomina/Facturacion/Comisiones/Consolidado) + Area/CC
3. **Tabla de reportes generados**:
   - Tipo | Periodo | Area | Formato | Generado por | Fecha | Acciones (Descargar/Eliminar)
4. **Modal "Generar Reporte"**: Dialog con rango de fecha, tipo, area, formato (CSV/Excel)
5. **Exportacion**: Usa `xlsx` (ya instalado) para Excel y generacion CSV nativa

---

### Fase 8: Rutas y Registro

**`src/App.tsx`** -- Agregar todas las rutas bajo `FinanzasLayout`:
```text
/finanzas                -> Dashboard Financiero
/finanzas/nomina         -> NominaPage
/finanzas/facturacion    -> FacturacionPage
/finanzas/comisiones     -> ComisionesPage
/finanzas/control        -> ControlFinancieroPage
/finanzas/reportes       -> ReportesPage
```

Todas envueltas en `ProtectedRoute` + `FinanzasLayout` (mismo patron que HR).

---

### Resumen de Archivos

| Tipo | Archivo | Descripcion |
|------|---------|-------------|
| Crear | `src/pages/finanzas/FinanzasLayout.tsx` | Layout wrapper (clon de HRLayout) |
| Crear | `src/pages/finanzas/FinanzasDashboard.tsx` | Dashboard principal con KPIs consolidados |
| Crear | `src/pages/finanzas/nomina/NominaPage.tsx` | Vista de nomina |
| Crear | `src/pages/finanzas/nomina/useNomina.ts` | Hook CRUD nomina |
| Crear | `src/pages/finanzas/facturacion/FacturacionPage.tsx` | Vista de facturacion |
| Crear | `src/pages/finanzas/facturacion/useFacturacion.ts` | Hook CRUD facturas |
| Crear | `src/pages/finanzas/comisiones/ComisionesPage.tsx` | Vista de comisiones |
| Crear | `src/pages/finanzas/comisiones/useComisiones.ts` | Hook CRUD comisiones |
| Crear | `src/pages/finanzas/control/ControlFinancieroPage.tsx` | Vista analitica |
| Crear | `src/pages/finanzas/reportes/ReportesPage.tsx` | Vista de reportes |
| Crear | `src/pages/finanzas/reportes/useReportes.ts` | Hook reportes |
| Modificar | `src/components/dashboard/DashboardSidebar.tsx` | Agregar grupo Finanzas |
| Modificar | `src/App.tsx` | Agregar rutas /finanzas/* |
| Migracion | SQL | Crear 5 tablas con RLS |

---

### Patrones Reutilizados (sin rediseno)

- `DashboardMetricCard` para todos los KPIs
- Tabs `inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1` con Button secondary/ghost
- Header `shrink-0 bg-background border-b px-6 pt-6 pb-4`
- Tabla con `sticky top-0 z-10 bg-card` y acciones `sticky right-0 bg-card`
- Tooltips en acciones con `side="left"`
- Toggle Lista/Grid con `ListIcon`/`LayoutGrid`
- Badges de estado con colores semanticos
- `AlertDialog` para confirmaciones de eliminacion
- `Dialog` para formularios de creacion/edicion
- `DateRangePicker` para filtros de fecha
- Skeleton loading en KPIs y tablas
- Boton CTA primario con variante `default`, secundarios con `outline`

---

### Nota sobre Implementacion

Dado el tamano del modulo (5 submenu + dashboard + 5 tablas SQL), se implementara en una sola iteracion comenzando por la migracion SQL, seguida del layout/sidebar, y luego cada submodulo en orden: Nomina, Facturacion, Comisiones, Control, Reportes. Todos los archivos seguiran estrictamente los patrones existentes sin introducir nuevos componentes ni estilos.

