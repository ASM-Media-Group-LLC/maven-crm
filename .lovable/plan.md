

## Implementación: Configuración Financiera + Banco de Horas Avanzado

Este plan cubre tres áreas: (1) tabla de configuración financiera en la base de datos, (2) implementación completa de las 5 tabs de ConfiguracionPage, y (3) mejora del Banco de Horas con historial de movimientos y consumo dinámico de parámetros.

---

### Estado actual

- **ConfiguracionPage**: Solo muestra tabs con placeholder "Próximamente".
- **Banco de Horas en Finanzas** (`HorasVariablesPage.tsx`): Opera sobre `payroll_details.hour_bank_hours/hour_bank_amount` con un valor fijo de $15/hora hardcodeado. No usa la tabla `hour_bank` real ni consume configuración dinámica.
- **Banco de Horas en HR** (`HRHourBank.tsx`): Opera sobre la tabla `hour_bank` (movimientos deposit/withdrawal por empleado). Es la fuente real de movimientos.
- **No existe tabla de configuración financiera** en la base de datos.
- **Sidebar**: Ya tiene todos los enlaces correctos (Dashboard, Collections, Nómina, Horas & Variables, Invoices, Control Financiero, Reportes, Configuración).

---

### 1. Nueva tabla: `financial_config`

Tabla clave-valor para almacenar todos los parámetros configurables:

```sql
CREATE TABLE financial_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key TEXT NOT NULL UNIQUE,
  config_value JSONB NOT NULL DEFAULT '{}',
  category TEXT NOT NULL,
  label TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
ALTER TABLE financial_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage financial_config"
  ON financial_config FOR ALL USING (true) WITH CHECK (true);
```

Se insertarán registros iniciales (seed) para cada categoría:

- **quickbooks_templates**: `{ mappings: [] }` — array de `{ category, account_code, account_name, type: "ingreso"|"egreso" }`
- **payment_methods**: `{ methods: [] }` — array de `{ name, commission_pct, is_active }`
- **cost_centers**: `{ centers: [] }` — array de `{ name, code, monthly_budget }`
- **commission_defaults**: `{ creator_pct, partner_pct, exceptions: [] }` — exceptions: `{ creator_id, custom_pct }`
- **payroll_params**: `{ health_pct, pension_pct, tax_pct, overtime_day_mult, overtime_night_mult, overtime_holiday_mult, hour_bank_expiry_months, hour_value }`

---

### 2. Hook: `useFinancialConfig`

Nuevo hook en `src/hooks/useFinancialConfig.ts`:

- `useFinancialConfig(category)` — query de `financial_config` filtrado por `category`
- `useUpdateFinancialConfig()` — mutation para upsert por `config_key`
- Funciones helper: `getPayrollParams()`, `getPaymentMethods()`, `getCostCenters()`, `getCommissionDefaults()`, `getQuickBooksTemplates()`

---

### 3. ConfiguracionPage — 5 tabs implementadas

**Tab 1: Templates QuickBooks**
- Tabla editable con columnas: Categoría, Tipo (Ingreso/Egreso), Código Cuenta, Nombre Cuenta
- Botón "Agregar Mapeo" abre inline row
- Acciones: Editar inline, Eliminar
- Guarda en `financial_config` con `config_key = "quickbooks_templates"`

**Tab 2: Métodos de Pago**
- Tabla CRUD: Nombre, Comisión (%), Activo (switch)
- Botón "Agregar Método"
- Al cambiar comisión, se usa en cálculos de Facturación Neta en invoices
- Guarda en `financial_config` con `config_key = "payment_methods"`

**Tab 3: Centros de Costo**
- Tabla: Nombre, Código, Presupuesto Mensual
- Botón "Agregar CC"
- Badge de alerta si CC excede presupuesto (comparando con `payroll_periods` + `commissions` del mes)
- Guarda en `financial_config` con `config_key = "cost_centers"`

**Tab 4: Config. Comisiones**
- Dos campos principales: % Creadoras, % Socios
- Tabla de excepciones: Creadora (select de `creators`), % Custom
- Botón "Agregar Excepción"
- Guarda en `financial_config` con `config_key = "commission_defaults"`

**Tab 5: Parámetros de Nómina**
- Sección "Deducciones": Salud %, Pensión %, Impuestos %
- Sección "Multiplicadores Horas Extra": Diurno (x), Nocturno (x), Festivo (x)
- Sección "Banco de Horas": Vigencia (meses), Valor por Hora ($)
- Botón "Guardar Cambios" con toast de confirmación
- Guarda en `financial_config` con `config_key = "payroll_params"`

---

### 4. Banco de Horas mejorado (HorasVariablesPage.tsx)

Cambios en la tab "Banco de Horas":

**a) Usar tabla `hour_bank` como fuente real** (en vez de `payroll_details`):
- Query: `hour_bank` con join a `employees`, agrupando por `employee_id` para calcular balance (sum deposits - sum withdrawals)
- Mostrar balance por empleado con desglose

**b) Acción "Liquidación en Nómina"**:
- Modal donde el usuario selecciona cuántas horas liquidar (con input numérico, max = balance)
- Multiplica por `hour_value` de `payroll_params` (consumido dinámicamente)
- Inserta un registro `withdrawal` en `hour_bank` con `reason: "Liquidación en nómina"`
- El monto calculado se muestra como referencia para sumarse al próximo periodo de nómina

**c) Acción "Compensar con Tiempo"**:
- Modal con input de horas/días a compensar
- Campo de motivo obligatorio
- Inserta un registro `withdrawal` en `hour_bank` con `reason` del usuario
- No afecta nómina

**d) Historial de movimientos**:
- Agregar una sub-tab o sección expandible "Historial" dentro de Banco de Horas
- Muestra todos los movimientos de `hour_bank` en tabla cronológica: Fecha, Empleado, Tipo (Depósito/Retiro), Horas, Motivo
- Filtrable por empleado y tipo

---

### 5. Consumo dinámico de configuración

- **NominaPage**: Al calcular nómina, leer `payroll_params` para deducciones (%) y multiplicadores de horas extra
- **HorasVariablesPage**: Leer `hour_value` para cálculos de pago de banco de horas
- **FacturacionPage**: Leer `payment_methods` para calcular comisión y facturación neta
- **ReportesPage**: Leer `cost_centers` para mostrar alerta si presupuesto excedido

---

### Resumen de archivos

| Archivo | Acción |
|---------|--------|
| Migración SQL | Crear tabla `financial_config` + seed de valores iniciales |
| `src/hooks/useFinancialConfig.ts` | **Nuevo** — Hook para leer/escribir configuración financiera |
| `src/pages/finanzas/configuracion/ConfiguracionPage.tsx` | **Reescribir** — Implementar las 5 tabs con formularios CRUD |
| `src/pages/finanzas/horas-variables/HorasVariablesPage.tsx` | **Modificar** — Banco de Horas usa `hour_bank` real + historial + config dinámica |
| `src/pages/finanzas/nomina/NominaPage.tsx` | **Modificar** — Consumir `payroll_params` para deducciones y multiplicadores |
| `src/integrations/supabase/types.ts` | **Actualizar** — Agregar tipo `financial_config` |

No se crean rutas nuevas. No se modifica el sidebar (ya está completo).

