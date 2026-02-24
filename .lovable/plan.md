

## Refactorización Completa del Módulo de Finanzas

Reorganización de la navegación, creación de la sección "Collections" como nueva vista de ingresos, y mejoras funcionales en Nómina, Horas, Facturación, Reportes y Configuración.

---

### Resumen de Cambios vs Estado Actual

**Lo que ya existe y funciona:**
- Dashboard con 8 KPIs, gráfico de flujo, alertas y acciones (se mantiene, se mejora)
- Nómina con 7 tabs: Cálculo, Recibos, Mail, Horas Extra, Banco de Horas, Comisiones, Batch (se reorganiza)
- Facturación con 4 tabs: Invoices, Notas de Pago, Mail, Archivo de PagoMundo (se amplía)
- Control Financiero con 4 tabs analíticas (se mantiene)
- Reportes con 2 tabs simplificadas + generador (se amplía)
- Configuración con 5 tabs placeholder (se activa)

**Lo que falta construir:**
1. **Collections (nueva sección)** — Dashboard de cobros, gestión de creadoras, registro de cobros
2. **Horas & Variables (nueva sección separada)** — Extraer Horas Extra, Banco de Horas y Comisiones de Nómina a su propia ruta
3. **Funcionalidad "Cerrar Mes"** en Nómina con generación de batch + envío de recibos
4. **Sistema Pagar/Compensar** en Banco de Horas
5. **Botón QuickBooks** para exportar batches
6. **Reportes ampliados** — Ventas por Creador, Por Método de Pago, Comparativos como tabs

---

### 1. Sidebar — Nueva Estructura de Navegación

**Actual:**
```text
Finanzas
  Dashboard Financiero
  ▸ Operaciones → Nómina
  ▸ Facturación → Invoices
  ▸ Análisis → Control Financiero, Reportes
  ▸ Configuración → Config. Financiera
```

**Propuesto:**
```text
Finanzas
  📊 Resumen (Dashboard)
  ▸ Ingresos
    └ Collections
  ▸ Operaciones
    └ Nómina
    └ Horas & Variables
  ▸ Facturación
    └ Invoices
  ▸ Análisis
    └ Control Financiero
    └ Reportes Avanzados
  ▸ Configuración
    └ Config. Financiera
```

Cambios: agregar "Collections" bajo nuevo grupo "Ingresos", agregar "Horas & Variables" bajo Operaciones (extraído de Nómina), renombrar "Reportes" a "Reportes Avanzados".

**Archivo:** `src/components/dashboard/DashboardSidebar.tsx` (lineas 312-346)

---

### 2. Rutas — Nuevas Rutas

Agregar:
- `/finanzas/collections` → CollectionsPage (nueva)
- `/finanzas/horas-variables` → HorasVariablesPage (nueva)

**Archivo:** `src/App.tsx` (importaciones + 2 nuevas Route)

---

### 3. Collections (Ingresos) — Nueva Página

Crear `src/pages/finanzas/collections/CollectionsPage.tsx`

**Tabs:** Dashboard de Cobros | Gestión de Creadoras | Registro de Cobros

**Tab "Dashboard de Cobros":**
- 4 KPI cards con gráfico de dona (Recharts PieChart):
  - Total Cobrado (invoices status pagada, sum amount)
  - Pendiente de Cobro (invoices status enviada)
  - Vencido (invoices status vencida, badge destructive)
  - Sin Cobro (invoices sin creator_id o monto 0)
- PieChart mostrando distribución por estado
- Datos provienen de tabla `invoices` existente

**Tab "Gestión de Creadoras":**
- Tabla con columnas: Creadora | Monto Quincenal | Monto Mensual | Estado de Cobro | Último Pago
- Datos de `invoices` agrupados por `creator_id`, join con `creators`
- Badges de estado: Pagada (accent), Pendiente (warning), Vencida (destructive), Sin Cobro (muted)
- Cada fila alimenta el Cash Flow del dashboard

**Tab "Registro de Cobros":**
- Botón "Registrar Cobro" que abre Dialog
- Dialog con: Select Creadora, Monto, Método de Pago, Fecha, Notas
- Al guardar: inserta invoice con status "pagada" y fecha actual
- Tabla de cobros recientes (últimos 50 invoices pagados)

**Archivos nuevos:**
- `src/pages/finanzas/collections/CollectionsPage.tsx`

---

### 4. Nómina — Reorganización de Tabs

**Tabs actuales:** Cálculo | Recibos | Mail | Horas Extra | Banco de Horas | Comisiones | Batch

**Tabs propuestas:** Cálculo | Recibos | Mail | Batch

- Extraer "Horas Extra", "Banco de Horas" y "Comisiones" a la nueva página "Horas & Variables"
- Agregar funcionalidad **"Cerrar Mes"** en tab Cálculo:
  - Botón "Cerrar Mes" en el header (junto a "Calcular Nómina" y "Crear Batch")
  - Al hacer click: Dialog de confirmación con resumen financiero
  - Al confirmar dispara 2 acciones:
    1. Cambia status de periodos borrador/calculado a "cerrado"
    2. Genera archivo batch bancario (CSV) automáticamente (usa `generateBankFile` existente)
    3. Toast con mensaje "Mes cerrado. Archivo bancario generado. Recibos disponibles para envío."
- Tab **Batch**: agregar botón "Exportar a QuickBooks" que genera CSV con formato de mapeo QuickBooks (columnas: Date, Name, Memo, Amount, Account)

**Archivo:** Modificar `src/pages/finanzas/nomina/NominaPage.tsx`

---

### 5. Horas & Variables — Nueva Página Separada

Crear `src/pages/finanzas/horas-variables/HorasVariablesPage.tsx`

**Tabs:** Horas Extra | Banco de Horas | Comisiones

**Tab "Horas Extra":**
- Misma implementación actual de NominaPage tab "Horas Extra" (KPIs + tabla de payroll_details con overtime)
- Sin cambios funcionales, solo se mueve

**Tab "Banco de Horas":**
- Misma implementación actual + **nuevo sistema Pagar/Compensar**:
  - Cada fila de la tabla tiene 2 botones de acción: "Pagar" y "Compensar"
  - "Pagar": Dialog con monto calculado automático, al confirmar cambia un campo (se usa `hour_bank_amount` para marcar como pagado, se crea un payroll_detail con overtime_amount)
  - "Compensar": Dialog con campo "Horas a compensar" + "Motivo", reduce `hour_bank_hours` del registro
  - Badge en fila mostrando si las horas están "Acumuladas", "Pagadas" o "Compensadas"

**Tab "Comisiones":**
- Misma implementación actual de NominaPage tab "Comisiones" (KPIs + tabla + filtros + NuevaComisionModal)
- Agregar columna "Comisión Acumulada" (sum final_amount del periodo)
- Agregar columna "Comisión Proyectada" (estimated_amount)
- Agregar botón "Exportar QuickBooks" en header: genera CSV con formato QuickBooks para comisiones confirmadas/pagadas

**Archivos nuevos:**
- `src/pages/finanzas/horas-variables/HorasVariablesPage.tsx`

---

### 6. Facturación — Tabs Ampliadas

**Tabs actuales:** Invoices | Notas de Pago | Mail | Archivo de PagoMundo

**Tabs propuestas:** Invoices | Notas de Pago | Reversos | Fees & Ajustes | Mail | Archivo de PagoMundo

- Restaurar tab **"Reversos"**: tabla filtrada por status "reversada", mostrando invoice_number, creador, monto, reversal_reason, fecha
- Restaurar tab **"Fees & Ajustes"**: tabla con columnas fee_type, fee_amount, net_amount, con opción de ajustar fee manualmente (Dialog con campo fee + motivo obligatorio + update a invoices)

**Archivo:** Modificar `src/pages/finanzas/facturacion/FacturacionPage.tsx`

---

### 7. Reportes Avanzados — Tabs Ampliadas

**Tabs actuales:** Estado de Cuenta CC | Reportes Generales

**Tabs propuestas:** Estado de Cuenta CC | Ventas por Creador | Por Método de Pago | Comparativos Mensuales | Reportes Generales

- **Ventas por Creador**: tabla de invoices agrupada por creator_id, mostrando Creador, Total Facturado, Total Cobrado, Pendiente, % del Total
- **Por Método de Pago**: tabla de invoices agrupada por payment_method, con KPIs por método
- **Comparativos Mensuales**: tabla de 6 meses con columnas Mes, Ingresos, Egresos, Margen, % Cambio vs anterior, usando datos de invoices + payroll
- "Reportes Generales" se mantiene con su Select interno

**Archivo:** Modificar `src/pages/finanzas/reportes/ReportesPage.tsx`

---

### 8. Dashboard (Resumen) — Mejoras Menores

- Actualizar la ruta de "Comisiones por aprobar" en Próximas Acciones: cambiar `/finanzas/comisiones` a `/finanzas/horas-variables` (ya que comisiones ahora vive ahí)
- Actualizar enlace "Archivos bancarios" a `/finanzas/nomina` (ya correcto)
- Sin cambios estructurales

**Archivo:** Modificar `src/pages/finanzas/FinanzasDashboard.tsx` (linea 128)

---

### 9. Configuración Financiera — Sin Cambios

Los 5 tabs placeholder actuales (Templates QuickBooks, Métodos de Pago, Centros de Costo, Config. Comisiones, Parámetros de Nómina) se mantienen. La activación de contenido real se hará en una fase posterior.

---

### Migración SQL

No se requieren nuevas tablas ni columnas. Los datos de Collections, Horas y Comisiones ya existen en `invoices`, `payroll_details` y `commissions`. El sistema Pagar/Compensar usa los campos existentes `hour_bank_hours` y `hour_bank_amount` de `payroll_details`.

---

### Resumen de Archivos

| Tipo | Archivo | Cambio |
|------|---------|--------|
| Crear | `src/pages/finanzas/collections/CollectionsPage.tsx` | Dashboard de cobros, gestión creadoras, registro |
| Crear | `src/pages/finanzas/horas-variables/HorasVariablesPage.tsx` | Horas Extra, Banco de Horas con Pagar/Compensar, Comisiones |
| Modificar | `src/pages/finanzas/nomina/NominaPage.tsx` | Reducir a 4 tabs, agregar "Cerrar Mes", QuickBooks en Batch |
| Modificar | `src/pages/finanzas/facturacion/FacturacionPage.tsx` | Agregar tabs Reversos y Fees & Ajustes |
| Modificar | `src/pages/finanzas/reportes/ReportesPage.tsx` | Agregar tabs Ventas por Creador, Método Pago, Comparativos |
| Modificar | `src/pages/finanzas/FinanzasDashboard.tsx` | Actualizar enlace comisiones |
| Modificar | `src/components/dashboard/DashboardSidebar.tsx` | Agregar Collections y Horas & Variables al sidebar |
| Modificar | `src/App.tsx` | Agregar 2 nuevas rutas |

