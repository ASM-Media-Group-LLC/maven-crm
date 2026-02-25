

## Plan de Implementación: Configuración Financiera + Banco de Horas Avanzado

He analizado en detalle todos los archivos involucrados. El plan se divide en 5 entregables que se implementarán en una sola pasada.

---

### Contexto Técnico

**Estado actual identificado:**
- `ConfiguracionPage.tsx` (30 líneas): Placeholder con 5 tabs vacíos mostrando "Próximamente"
- `HorasVariablesPage.tsx` (639 líneas): Banco de Horas opera sobre `payroll_details.hour_bank_hours/hour_bank_amount` con valor fijo `$15/hora`. No usa la tabla real `hour_bank` (que tiene movimientos deposit/withdrawal por empleado)
- `NominaPage.tsx` (461 líneas): Deducciones hardcodeadas, no consume configuración dinámica
- `FacturacionPage.tsx` (486 líneas): Fee hardcodeado como "PayPal", no consume métodos de pago configurables
- No existe tabla `financial_config` en la base de datos
- La tabla `hour_bank` ya existe con columnas: `employee_id`, `hours`, `movement_type` (deposit/withdrawal), `reason`, `reference_date`, `created_by`

---

### 1. Migración SQL: tabla `financial_config` + seed

Crear tabla clave-valor con JSONB para almacenar todos los parámetros configurables. Incluye seed con valores iniciales para las 5 categorías:

- `quickbooks_templates`: mappings vacíos
- `payment_methods`: PayPal (5.4%), PagoMundo (2.5%), Transferencia (0%)
- `cost_centers`: centros vacíos
- `commission_defaults`: creator_pct 50%, partner_pct 20%
- `payroll_params`: deducciones (salud 4%, pensión 4%), multiplicadores (1.25x, 1.75x, 2.0x), hour_value $15, vigencia 6 meses

RLS: política permisiva para usuarios autenticados.

---

### 2. Nuevo hook: `useFinancialConfig.ts`

Archivo nuevo en `src/hooks/useFinancialConfig.ts` con:

- `useFinancialConfig(configKey?)` — query genérico a `financial_config`
- `useUpdateFinancialConfig()` — mutation upsert por `config_key`
- Hooks especializados: `usePayrollParams()`, `usePaymentMethods()`, `useCostCenters()`, `useCommissionDefaults()`, `useQuickBooksTemplates()`
- Interfaces TypeScript para cada tipo de configuración

---

### 3. ConfiguracionPage — 5 tabs completos

Reescritura completa del archivo (actualmente 30 líneas placeholder). Cada tab:

**Tab 1 — Templates QuickBooks:**
- Tabla editable: Categoría, Tipo (Ingreso/Egreso via Select), Código Cuenta, Nombre Cuenta
- Botón "Agregar Mapeo" añade fila inline editable
- Acciones por fila: Guardar/Eliminar
- Persiste en `financial_config` key `quickbooks_templates`

**Tab 2 — Métodos de Pago:**
- Tabla CRUD: Nombre (Input), Comisión % (Input number), Activo (Switch)
- Botón "Agregar Método"
- Toggle activo/inactivo inmediato
- Persiste en key `payment_methods`

**Tab 3 — Centros de Costo:**
- Tabla: Nombre, Código, Presupuesto Mensual ($)
- Botón "Agregar Centro de Costo"
- Badge de alerta visual si presupuesto = 0 (configuración incompleta)
- Persiste en key `cost_centers`

**Tab 4 — Config. Comisiones:**
- Dos campos numéricos: % Creadoras, % Socios
- Tabla de excepciones: Creadora (Select de `creators`), % Custom
- Botón "Agregar Excepción"
- Persiste en key `commission_defaults`

**Tab 5 — Parámetros de Nómina:**
- Sección "Deducciones Legales": Salud %, Pensión %, Impuestos %
- Sección "Multiplicadores Horas Extra": Diurno (x), Nocturno (x), Festivo (x)
- Sección "Banco de Horas": Vigencia (meses), Valor por Hora ($)
- Botón "Guardar Cambios" con toast de confirmación
- Persiste en key `payroll_params`

---

### 4. Banco de Horas mejorado (HorasVariablesPage.tsx)

Cambios en la tab "Banco de Horas":

**a) Fuente de datos real — tabla `hour_bank`:**
- Nueva query: `hour_bank` con join a `employees`, sin filtrar por `payroll_details`
- Agrupación client-side por `employee_id` para calcular balance (sum deposits - sum withdrawals)
- Mostrar balance neto por empleado

**b) Liquidación en Nómina mejorada:**
- Modal con input numérico de horas a liquidar (max = balance disponible)
- Multiplicación dinámica por `hour_value` de `payroll_params` (via `usePayrollParams()`)
- Inserta un registro `withdrawal` en `hour_bank` con `reason: "Liquidación en nómina"`
- Muestra preview del monto calculado antes de confirmar

**c) Compensar con Tiempo mejorado:**
- Modal con input de horas + motivo obligatorio
- Inserta `withdrawal` en `hour_bank` con el `reason` del usuario
- No afecta nómina

**d) Nueva sección "Historial de Movimientos":**
- Sub-tab o sección expandible dentro de "Banco de Horas"
- Tabla cronológica: Fecha, Empleado, Tipo (Depósito/Retiro con badge), Horas, Motivo
- Filtrable por empleado y tipo de movimiento
- Exportable a Excel

---

### 5. Consumo dinámico en otros módulos

**NominaPage.tsx — CalcularNominaModal:**
- Al crear periodo, leer `payroll_params` para mostrar info de deducciones (%) y multiplicadores
- Los valores se muestran como referencia en el modal de cálculo

**FacturacionPage.tsx:**
- En la tab "Fees & Ajustes", mostrar los métodos de pago configurados con sus comisiones
- Al crear invoice, sugerir el fee_type basado en métodos activos

---

### Resumen de archivos

| Archivo | Acción | Líneas aprox. |
|---------|--------|---------------|
| `supabase/migrations/20260225_financial_config.sql` | **Nuevo** — Tabla + seed | ~25 |
| `src/hooks/useFinancialConfig.ts` | **Nuevo** — Hook + interfaces | ~120 |
| `src/pages/finanzas/configuracion/ConfiguracionPage.tsx` | **Reescribir** — 5 tabs CRUD completos | ~650 |
| `src/pages/finanzas/horas-variables/HorasVariablesPage.tsx` | **Modificar** — Banco de Horas usa `hour_bank` real + historial + config dinámica | ~750 |
| `src/pages/finanzas/nomina/NominaPage.tsx` | **Modificar** — Consumir `payroll_params` en PeriodDetailContent | ~470 |
| `src/pages/finanzas/facturacion/FacturacionPage.tsx` | **Modificar** — Mostrar métodos de pago en Fees tab | ~500 |

No se crean rutas nuevas. No se modifica el sidebar (ya está completo). Todos los componentes siguen el Design System existente (badges, tables, cards, dialogs, toasts).

