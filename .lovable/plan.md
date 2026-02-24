

## Funcionalidades y Mejoras para Dashboard y Operaciones de Finanzas

Este plan cubre la implementacion completa de funcionalidades para el Dashboard General, Nomina, Comisiones, Facturacion, Horas, Control Financiero y Reportes. Se divide en fases para mantener estabilidad.

---

### Fase 1: Dashboard General Financiero (FinanzasDashboard.tsx)

**Estado actual:** 4 KPIs basicos y un placeholder.

**Se reemplazara completamente con:**

**Seccion 1 -- Filtros globales (barra horizontal)**
- DateRangePicker (rango de fecha)
- Select: Centro de Costo
- Select: Area
- Select: Tipo (Ingresos / Egresos / Ambos)
- Boton "Limpiar"

**Seccion 2 -- 8 KPI Cards (grid 2x4 en desktop)**
Cada una con valor actual, subtitulo comparativo vs periodo anterior, e indicador visual positivo (accent) / negativo (destructive):

1. Ingresos del Mes (invoices pagadas del mes actual)
2. Costos del Mes (nomina + comisiones pagadas del mes)
3. Margen Operativo (ingresos - costos, con % y color semantico)
4. Nomina Proyectada (periodos en borrador/calculado del mes)
5. Comisiones Acumuladas (suma estimada del mes)
6. Facturas Pendientes de Cobro (status enviada, count)
7. Facturas Vencidas (status vencida, count, siempre destructive si > 0)
8. Variacion vs Mes Anterior (% calculado comparando totales)

**Seccion 3 -- Flujo de Dinero (grafico recharts)**
- Card con titulo "Flujo de Dinero"
- BarChart agrupado: Ingresos vs Costos por mes (ultimos 6 meses)
- Usa datos de invoices (pagadas) vs payroll + commissions (pagados)
- Selector de rango integrado (3M / 6M / 12M)
- Mismos colores semanticos: accent para ingresos, destructive para costos

**Seccion 4 -- Alertas Operativas**
- Card con titulo "Alertas Operativas" e icono AlertTriangle
- Lista de alertas condicionales (solo aparecen si hay datos):
  - Facturas vencidas (count, badge destructive)
  - Nomina superior al presupuesto (si gross_total > threshold configurable)
  - Comision fuera de rango (si percentage > 50% como ejemplo)
  - Pagos pendientes de ejecutar (invoices enviadas)
  - Batch de nomina sin cerrar (periodos en borrador/calculado)
- Si no hay alertas: mensaje "Sin alertas activas"

**Seccion 5 -- Proximas Acciones**
- Card con titulo "Proximas Acciones" e icono ListChecks
- Lista operativa con icono + texto + badge count:
  - Nomina por cerrar (periodos status borrador/calculado)
  - Comisiones por aprobar (status proyectado)
  - Invoices por enviar (status borrador)
  - Archivos bancarios por generar (placeholder count 0)
- Cada item clickeable (navega a la seccion correspondiente)

**Archivos:**
- Modificar: `src/pages/finanzas/FinanzasDashboard.tsx` (reescritura completa)

---

### Fase 2: Nomina -- Funcionalidades Completas (NominaPage.tsx)

**Estado actual:** Tabla CRUD basica con KPIs, filtros y vista grid. Solo tab "Calculo de Nomina" activa.

**Mejoras a la tab "Calculo de Nomina":**

1. **Columna "Responsable"** en la tabla (usar `created_by` con join a `profiles`)
2. **Modal "Calcular Nomina"** (Dialog):
   - Select empleados (todos o por area/CC)
   - DateRangePicker para periodo
   - Calculo automatico: base_salary + overtime_amount + commission_amount - deductions de `payroll_details`
   - Preview del calculo antes de guardar
   - Boton "Calcular y Guardar" que crea el `payroll_period` con status "calculado"
3. **Modal "Crear Batch"** (Dialog):
   - Seleccionar multiples periodos (checkbox)
   - Accion masiva: cambiar status a "cerrado"
   - Motivo obligatorio (textarea)
   - Registro de timestamp y usuario
4. **Bloqueo de edicion**: Si status es "cerrado" o "pagado", ocultar botones de editar/eliminar y mostrar candado
5. **Detalle mejorado** (Dialog existente ampliado):
   - Tabs internas: Desglose | Horas Extra | Banco de Horas | Comision Laboral | Historial
   - Tab Desglose: tabla de `payroll_details` con empleados y sus montos
   - Tab Horas Extra: overtime_hours y overtime_amount de payroll_details
   - Tab Banco de Horas: hour_bank_hours y hour_bank_amount
   - Tab Comision Laboral: commission_amount por empleado
   - Tab Historial: log de cambios (created_at, status changes)

**Tabs nuevas activadas:**

- **Tiempo Real**: KPIs de proyeccion (suma de base_salary de empleados activos como proyeccion), tabla con empleados y su salario base + comisiones estimadas del mes actual
- **Batch**: Tabla de periodos agrupados, accion de cerrar batch masivo, exportacion a formato QuickBooks (CSV con formato especifico)
- **Recibos de Pago**: Tabla de periodos pagados, boton "Generar PDF" por periodo (usa jspdf ya instalado), preview del recibo
- **Archivos Bancarios**: Tabla de periodos cerrados/pagados, boton "Generar Archivo" que produce CSV con formato bancario (nombre, cuenta, monto neto)

**Archivos:**
- Modificar: `src/pages/finanzas/nomina/NominaPage.tsx` (ampliar significativamente)
- Crear: `src/pages/finanzas/nomina/CalcularNominaModal.tsx`
- Crear: `src/pages/finanzas/nomina/CrearBatchModal.tsx`
- Crear: `src/pages/finanzas/nomina/NominaDetailDialog.tsx`
- Crear: `src/pages/finanzas/nomina/useNomina.ts` (hook con mutaciones CRUD y calculo)
- Crear: `src/pages/finanzas/nomina/generatePayrollPdf.ts` (generador de recibos PDF)

---

### Fase 3: Comisiones -- Separacion y Motor de Calculo

**Estado actual:** Tabla basica con tabs placeholder.

**Cambios:**

1. **Separacion en la UI**: Agregar Select en filtros para "Tipo de Comision":
   - Laboral (impacta nomina -- se vincula a employee_id)
   - Comercial (ventas -- se vincula a creator_id)
   
2. **Columna "Comision Acumulada"**: suma de final_amount por empleado/creador en el periodo
3. **Columna "Comision Proyectada"**: estimated_amount

4. **Filtros adicionales**: Periodo (select), Area (select), Creador (select), Centro de Costo (select)

5. **Motor de calculo configurable** (Modal "Nueva Comision"):
   - Select tipo: % Fijo | Escalonado | Por Meta
   - % Fijo: campo porcentaje + base
   - Escalonado: rangos (0-1000: 5%, 1001-5000: 8%, etc.) -- UI con filas dinamicas
   - Por Meta: meta target + % si cumple
   - Calculo automatico del estimated_amount
   - Motivo obligatorio para ajustes manuales

6. **Tabs activadas:**
   - **En Tiempo Real**: muestra comisiones con status "proyectado" + calculo live basado en datos actuales
   - **Proyeccion**: tabla con estimaciones del mes siguiente basadas en tendencia
   - **Historial Batch**: tabla de comisiones con status "pagado", boton exportar a QuickBooks (CSV)

7. **Accion "Enviar a Nomina"**: Boton que crea un payroll_detail con commission_amount basado en la comision confirmada

**Archivos:**
- Modificar: `src/pages/finanzas/comisiones/ComisionesPage.tsx`
- Crear: `src/pages/finanzas/comisiones/NuevaComisionModal.tsx`
- Crear: `src/pages/finanzas/comisiones/useComisiones.ts`

---

### Fase 4: Facturacion -- CRUD Completo y Estados

**Estado actual:** Tabla funcional con filtros. Sin modal de creacion/edicion.

**Cambios:**

1. **Estado "Parcial"** agregado a la tabla de badges
2. **Modal "Crear Invoice"** (Dialog):
   - Select creador (desde `creators`)
   - Monto
   - Fee type: PayPal (calculo auto 3.49% + $0.49) | Standard (campo manual) | Ninguno
   - Metodo de pago (Select: PayPal, Transferencia, Crypto, Otro)
   - Fecha de vencimiento (Popover + Calendar)
   - Notas
   - Preview del calculo neto antes de guardar
   - Generacion automatica de invoice_number

3. **Modal "Editar Invoice"**: Mismo formulario, solo si status es borrador/enviada
4. **Accion "Reversar"**: Dialog de confirmacion con motivo obligatorio, cambia status a "reversada" y guarda reversal_reason
5. **Boton header "Envio Masivo"**: Dialog multi-select de invoices en borrador, cambia status a "enviada" masivamente

6. **Tabs activadas:**
   - **Invoices**: vista actual mejorada
   - **Envio Masivo**: tabla con checkbox, filtro por borrador, accion masiva enviar
   - **Notas de Pago**: tabla filtrada por status pagada/parcial, con campo de notas de pago editables
   - **Reversos**: tabla filtrada por status reversada, mostrando razon
   - **Fees & Ajustes**: tabla con columnas fee_type, fee_amount, con opcion de ajustar fee manualmente (Dialog con motivo)

7. **Exportacion CSV/Excel**: Boton en header que exporta la tabla filtrada actual usando `xlsx`

**Archivos:**
- Modificar: `src/pages/finanzas/facturacion/FacturacionPage.tsx`
- Crear: `src/pages/finanzas/facturacion/CrearInvoiceModal.tsx`
- Crear: `src/pages/finanzas/facturacion/EditarInvoiceModal.tsx`
- Crear: `src/pages/finanzas/facturacion/ReversarInvoiceModal.tsx`
- Crear: `src/pages/finanzas/facturacion/EnvioMasivoModal.tsx`
- Crear: `src/pages/finanzas/facturacion/useFacturacion.ts`

---

### Fase 5: Horas & Banco de Horas

**Estado actual:** Solo placeholders.

**Implementar:**

- **Tab "Horas Extra"**:
  - KPIs: Total Horas Extra (sum overtime_hours), Costo Total (sum overtime_amount), Promedio por Empleado
  - Tabla desde `payroll_details` agrupada por empleado: Empleado | Horas | Monto | Periodo | Estado del Periodo
  - Filtros: Periodo, Empleado, Area

- **Tab "Banco de Horas"**:
  - KPIs: Total Horas Acumuladas (sum hour_bank_hours), Valor Total (sum hour_bank_amount)
  - Tabla: Empleado | Horas Acumuladas | Valor | Ultimo Periodo
  - Filtros: Empleado, Area

- Ambas tabs muestran datos derivados de `payroll_details` sin nueva tabla

**Archivos:**
- Modificar: `src/pages/finanzas/horas/HorasPage.tsx`

---

### Fase 6: Control Financiero -- Todas las Tabs

**Estado actual:** Tab "Ingresos vs Costos" con KPIs y tabla basica.

**Activar tabs restantes:**

- **Costos por CC**: Tabla agrupada por cost_center de payroll_periods, mostrando total por CC, comparativo
- **Productividad por Empleado**: Tabla con empleados, horas trabajadas (overtime), salario, ratio costo/hora
- **Margenes Operativos**: KPIs de margen bruto y neto, tabla por concepto con margenes calculados

**Filtros adicionales** (aplicados a todas las tabs):
- DateRangePicker
- Select Centro de Costo
- Select Area

**Archivos:**
- Modificar: `src/pages/finanzas/control/ControlFinancieroPage.tsx`

---

### Fase 7: Reportes -- Generador Funcional

**Estado actual:** Tabla de reportes con tabs placeholder.

**Implementar:**

1. **Modal "Generar Reporte"** (Dialog):
   - Select tipo de reporte (Nomina/Facturacion/Comisiones/Consolidado + los 6 tipos de tab)
   - DateRangePicker periodo
   - Select Area/CC
   - Select formato: CSV | Excel
   - Boton "Generar" que:
     - Consulta datos segun tipo
     - Genera archivo con `xlsx` (Excel) o CSV nativo
     - Descarga automatica
     - Guarda registro en `financial_reports`

2. **Tabs activadas** (cada una filtra la tabla por tipo):
   - Ganancias & Comisiones: reportes tipo comisiones
   - Ventas por Creador: reportes agrupados por creator
   - Ventas Generales: reportes tipo facturacion
   - Estado de Cuenta por CC: reportes por cost_center
   - Comparativos Mensuales: reportes tipo consolidado
   - Por Metodo de Pago: reportes agrupados por payment_method

**Archivos:**
- Modificar: `src/pages/finanzas/reportes/ReportesPage.tsx`
- Crear: `src/pages/finanzas/reportes/GenerarReporteModal.tsx`
- Crear: `src/pages/finanzas/reportes/useReportes.ts`
- Crear: `src/pages/finanzas/reportes/generateReport.ts` (logica de generacion con xlsx)

---

### Migracion SQL

Se necesitan ajustes menores a las tablas existentes:

1. **Agregar columna `commission_type`** a tabla `commissions`:
   - Tipo: `text`, default `'laboral'`, valores: `laboral` | `comercial`
   
2. **Agregar columna `calculation_method`** a tabla `commissions`:
   - Tipo: `text`, default `'fixed_percentage'`, valores: `fixed_percentage` | `tiered` | `goal_based`

3. **Agregar columna `calculation_config`** a tabla `commissions`:
   - Tipo: `jsonb`, default `'{}'`, para guardar rangos escalonados o metas

4. **Agregar estado `parcial`** -- No requiere migracion ya que status es `text`

5. **Agregar columna `responsible_id`** a tabla `payroll_periods`:
   - Tipo: `uuid`, nullable, referencia logica a profiles

---

### Reglas Operativas Implementadas

- Todo modal de ajuste manual incluye campo "Motivo" obligatorio (textarea required)
- Periodos con status "cerrado"/"pagado" bloquean acciones de editar/eliminar (UI oculta botones)
- Todas las mutaciones registran `created_by` con `auth.uid()` y timestamp automatico (`created_at`)
- Modal de calculo/batch muestra preview del impacto financiero antes de confirmar
- Ingresos (invoices) y nomina se muestran en secciones separadas, nunca mezclados

---

### Resumen de Archivos

| Tipo | Archivo | Descripcion |
|------|---------|-------------|
| Modificar | `FinanzasDashboard.tsx` | Dashboard completo con KPIs, grafico, alertas, acciones |
| Modificar | `NominaPage.tsx` | Tabs funcionales, bloqueo, responsable |
| Crear | `CalcularNominaModal.tsx` | Modal de calculo automatico |
| Crear | `CrearBatchModal.tsx` | Modal de batch con cierre masivo |
| Crear | `NominaDetailDialog.tsx` | Detalle con tabs internas |
| Crear | `useNomina.ts` | Hook CRUD y calculo |
| Crear | `generatePayrollPdf.ts` | Generador PDF recibos |
| Modificar | `ComisionesPage.tsx` | Motor configurable, tipo laboral/comercial |
| Crear | `NuevaComisionModal.tsx` | Modal con motor de calculo |
| Crear | `useComisiones.ts` | Hook CRUD comisiones |
| Modificar | `FacturacionPage.tsx` | Tabs activas, estado parcial |
| Crear | `CrearInvoiceModal.tsx` | Modal creacion con fee auto |
| Crear | `EditarInvoiceModal.tsx` | Modal edicion |
| Crear | `ReversarInvoiceModal.tsx` | Modal reverso con motivo |
| Crear | `EnvioMasivoModal.tsx` | Modal envio masivo |
| Crear | `useFacturacion.ts` | Hook CRUD facturacion |
| Modificar | `HorasPage.tsx` | Tabs funcionales con datos reales |
| Modificar | `ControlFinancieroPage.tsx` | Todas las tabs activas |
| Modificar | `ReportesPage.tsx` | Generador funcional |
| Crear | `GenerarReporteModal.tsx` | Modal de generacion |
| Crear | `useReportes.ts` | Hook reportes |
| Crear | `generateReport.ts` | Logica xlsx/csv |
| Migracion | SQL | 3 columnas nuevas en commissions + 1 en payroll_periods |

