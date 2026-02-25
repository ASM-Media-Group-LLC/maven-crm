

## Implementación Completa: Configuración Financiera + Banco de Horas

He revisado todos los archivos en detalle. Aquí está el plan exacto de lo que se implementará al aprobar:

---

### Entregable 1: Migración SQL — `financial_config`

Tabla clave-valor JSONB con 5 registros seed:

| config_key | Contenido |
|---|---|
| `quickbooks_templates` | mappings vacíos |
| `payment_methods` | PayPal 5.4%, PagoMundo 2.5%, Transferencia 0% |
| `cost_centers` | centros vacíos |
| `commission_defaults` | creator 50%, partner 20%, exceptions vacías |
| `payroll_params` | salud 4%, pensión 4%, multiplicadores 1.25x/1.75x/2.0x, hour_value $15, vigencia 6 meses |

RLS permisiva + trigger `updated_at`.

---

### Entregable 2: Hook `useFinancialConfig.ts` (nuevo)

- Interfaces TypeScript: `QBMapping`, `PaymentMethod`, `CostCenter`, `CommissionDefaults`, `PayrollParams`
- `useFinancialConfig(configKey?)` — query genérico
- `useUpdateFinancialConfig()` — mutation upsert
- Hooks especializados: `usePayrollParams()`, `usePaymentMethods()`, `useCostCenters()`, `useCommissionDefaults()`, `useQuickBooksTemplates()`

---

### Entregable 3: `ConfiguracionPage.tsx` (reescritura completa)

5 tabs CRUD funcionales con persistencia real:

**Tab 1 — Templates QuickBooks:** Tabla editable inline (Categoría, Tipo ingreso/egreso, Código, Nombre Cuenta) + Agregar/Eliminar + Guardar

**Tab 2 — Métodos de Pago:** Tabla CRUD (Nombre, Comisión %, Switch activo) + Agregar/Eliminar + Guardar

**Tab 3 — Centros de Costo:** Tabla (Nombre, Código, Presupuesto mensual) + Badge destructive si presupuesto = 0 + Agregar/Eliminar + Guardar

**Tab 4 — Config. Comisiones:** Campos % Creadoras y % Socios + tabla de excepciones con Select de `creators` + Agregar/Eliminar + Guardar

**Tab 5 — Parámetros de Nómina:** 3 secciones con inputs numéricos — Deducciones (Salud%, Pensión%, Impuestos%), Multiplicadores HE (Diurno, Nocturno, Festivo), Banco de Horas (Vigencia meses, Valor hora $) + Guardar Cambios

---

### Entregable 4: `HorasVariablesPage.tsx` (Banco de Horas mejorado)

- **Fuente de datos real:** Nueva query a tabla `hour_bank` con join a `employees`, agrupando client-side por `employee_id` para calcular balance (sum deposits - sum withdrawals)
- **Liquidación en Nómina:** Modal con input numérico (max = balance), multiplicación dinámica por `hour_value` de `usePayrollParams()`, inserta `withdrawal` en `hour_bank`
- **Compensar con Tiempo:** Modal con horas + motivo obligatorio, inserta `withdrawal` en `hour_bank`
- **Historial de Movimientos:** Nueva sub-tab con tabla cronológica (Fecha, Empleado, Tipo Depósito/Retiro con badge, Horas, Motivo), filtrable por empleado y tipo

---

### Entregable 5: Consumo dinámico

- **`CalcularNominaModal.tsx`:** Reemplazar centros de costo hardcodeados ("operaciones", "ventas", "admin") con `useCostCenters()`, mostrar info de deducciones de `usePayrollParams()` en preview
- **`FacturacionPage.tsx`:** En tab "Fees & Ajustes", mostrar métodos de pago activos con comisiones configuradas usando `usePaymentMethods()`

---

### Archivos a crear/modificar

| Archivo | Acción |
|---------|--------|
| `supabase/migrations/20260225120000_financial_config.sql` | Nuevo — Tabla + seed |
| `src/hooks/useFinancialConfig.ts` | Nuevo — Hook + interfaces |
| `src/pages/finanzas/configuracion/ConfiguracionPage.tsx` | Reescribir — 5 tabs CRUD |
| `src/pages/finanzas/horas-variables/HorasVariablesPage.tsx` | Modificar — Banco de Horas real + historial |
| `src/pages/finanzas/nomina/CalcularNominaModal.tsx` | Modificar — Centros de costo + deducciones dinámicas |
| `src/pages/finanzas/facturacion/FacturacionPage.tsx` | Modificar — Métodos de pago dinámicos en Fees tab |

No se crean rutas nuevas. No se modifica el sidebar.

