

## Plan de Implementación Completa: Configuración Financiera + Banco de Horas

He verificado el estado actual — **nada se ha implementado aún**. El `ConfiguracionPage` sigue mostrando "Próximamente", no existe el hook `useFinancialConfig`, ni la tabla `financial_config` en la base de datos.

---

### Estado actual confirmado

| Archivo | Estado |
|---------|--------|
| `ConfiguracionPage.tsx` | 30 líneas — placeholder con "Próximamente" |
| `HorasVariablesPage.tsx` | 639 líneas — Banco de Horas usa `payroll_details` con valor fijo `$15/hora` |
| `NominaPage.tsx` | 461 líneas — centros de costo hardcodeados en `CalcularNominaModal` |
| `FacturacionPage.tsx` | 486 líneas — fee_type hardcodeado como "PayPal" |
| `useFinancialConfig.ts` | No existe |
| Tabla `financial_config` | No existe en la BD |

---

### Entregable 1: Migración SQL

Crear tabla `financial_config` con estructura clave-valor JSONB + seed de 5 registros iniciales:

- `quickbooks_templates` — mappings vacíos
- `payment_methods` — PayPal (5.4%), PagoMundo (2.5%), Transferencia (0%)
- `cost_centers` — centros vacíos
- `commission_defaults` — creator 50%, partner 20%
- `payroll_params` — salud 4%, pensión 4%, multiplicadores 1.25x/1.75x/2.0x, hour_value $15

RLS permisiva + trigger `updated_at`.

---

### Entregable 2: Hook `useFinancialConfig.ts` (nuevo)

- `useFinancialConfig(configKey?)` — query genérico
- `useUpdateFinancialConfig()` — mutation upsert
- Hooks especializados: `usePayrollParams()`, `usePaymentMethods()`, `useCostCenters()`, `useCommissionDefaults()`, `useQuickBooksTemplates()`
- Interfaces TypeScript para cada tipo

---

### Entregable 3: `ConfiguracionPage.tsx` (reescritura completa)

5 tabs con CRUD completo, usando el hook para persistir cambios:

**Tab 1 — Templates QuickBooks:** Tabla editable (Categoría, Tipo ingreso/egreso, Código, Nombre Cuenta) + botón Agregar Mapeo + eliminar por fila

**Tab 2 — Métodos de Pago:** Tabla CRUD (Nombre, Comisión %, Switch activo) + Agregar Método

**Tab 3 — Centros de Costo:** Tabla (Nombre, Código, Presupuesto mensual $) + Agregar CC + badge alerta si presupuesto = 0

**Tab 4 — Config. Comisiones:** Campos % Creadoras y % Socios + tabla de excepciones con Select de `creators` + Agregar Excepción

**Tab 5 — Parámetros de Nómina:** 3 secciones — Deducciones (Salud%, Pensión%, Impuestos%), Multiplicadores HE (Diurno, Nocturno, Festivo), Banco de Horas (Vigencia meses, Valor hora $) + botón Guardar

---

### Entregable 4: `HorasVariablesPage.tsx` (modificación)

Cambios en la tab "Banco de Horas":

- **Fuente de datos real:** Query a tabla `hour_bank` con join a `employees`, agrupando client-side por `employee_id` para calcular balance (sum deposits - sum withdrawals)
- **Liquidación en Nómina mejorada:** Modal con input numérico (max = balance), multiplicación dinámica por `hour_value` de `usePayrollParams()`, inserta `withdrawal` en `hour_bank`
- **Compensar con Tiempo mejorado:** Modal con horas + motivo obligatorio, inserta `withdrawal` en `hour_bank`
- **Nueva sección "Historial de Movimientos":** Sub-tab con tabla cronológica (Fecha, Empleado, Tipo con badge Depósito/Retiro, Horas, Motivo), filtrable por empleado y tipo

---

### Entregable 5: Consumo dinámico

- **`CalcularNominaModal.tsx`:** Reemplazar centros de costo hardcodeados con `useCostCenters()`, mostrar deducciones configuradas de `usePayrollParams()` en preview
- **`FacturacionPage.tsx`:** En tab "Fees & Ajustes", mostrar métodos de pago activos con sus comisiones usando `usePaymentMethods()`

---

### Archivos a crear/modificar

| Archivo | Acción |
|---------|--------|
| `supabase/migrations/20260225120000_financial_config.sql` | **Nuevo** — Tabla + seed |
| `src/hooks/useFinancialConfig.ts` | **Nuevo** — Hook + interfaces |
| `src/pages/finanzas/configuracion/ConfiguracionPage.tsx` | **Reescribir** — 5 tabs CRUD |
| `src/pages/finanzas/horas-variables/HorasVariablesPage.tsx` | **Modificar** — Banco de Horas real + historial |
| `src/pages/finanzas/nomina/CalcularNominaModal.tsx` | **Modificar** — Consumir config dinámica |
| `src/pages/finanzas/facturacion/FacturacionPage.tsx` | **Modificar** — Métodos de pago dinámicos |

No se crean rutas nuevas. No se modifica el sidebar.

