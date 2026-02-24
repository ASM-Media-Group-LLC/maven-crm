

## Refactorización de Collections, Control Financiero y Reportes Avanzados

Tres bloques de cambios: (1) rediseñar Collections según la imagen de referencia y sacarlo del grupo "Ingresos", (2) mejorar Control Financiero y Reportes para que se vean bien, (3) agregar toggle list/grid donde falte.

---

### 1. Sidebar — Sacar Collections de "Ingresos"

Eliminar el grupo "Ingresos" del sidebar. Collections pasa a ser un item directo del menú de Finanzas, al mismo nivel que Dashboard.

**Archivo:** `src/components/dashboard/DashboardSidebar.tsx`
- Eliminar el bloque `finanzasGroups[0]` (grupo "Ingresos" con Collections)
- Agregar `{ title: "Collections", url: "/finanzas/collections" }` como item directo en `finFlatItems`, después de Dashboard
- Renderizarlo como `SidebarMenuItem` directo (igual que Dashboard), no dentro de un Collapsible group

---

### 2. Collections — Rediseño completo del Dashboard según imagen

La imagen muestra un layout específico con 3 filas de cards + 3 gráficos. Reconstruir `CollectionsPage.tsx` con:

**Fila 1 — Cards de Frecuencia (2 columnas):**
- Card "QUINCENAL": `X creadoras`, `$X` monto, "Cobro cada 15 días"
- Card "MENSUAL": `X creadoras`, `$X` monto, "Cobro cada mes"
- Labels en colores: QUINCENAL (cyan), MENSUAL (warning/amarillo)

**Fila 2 — KPIs financieros (4 columnas):**
- Ventas Último Mes: total invoices del último mes (text-accent verde)
- Promedio 6 Meses: promedio histórico (text-primary)
- Comisión Socios: sum de comisiones con socios (text-warning)
- Facturación Neta: neto real (text-accent)

**Fila 3 — Cards de estado con conteos (5 columnas):**
- Total: count + monto bruto + monto neto + icono Users
- Pagadas: count + monto + neto + icono CheckCircle
- Pendientes: count + monto + icono Clock (text-warning)
- Vencidas: count + monto + neto + icono AlertTriangle (text-destructive)
- Sin Cobro: count + $0 + icono X (text-muted)
- La card "Total" con border-primary highlight

**Fila 4 — Gráficos (3 columnas):**
- "Estado de Cobros": PieChart donut con leyenda (Pagadas, Pendientes, Vencidas, Sin cobro)
- "Dinero por Estado": PieChart donut con montos (Pagado, Pendiente, Vencido)
- "Cobros Mensuales (6 meses)": BarChart apilado por mes con 3 colores (verde, naranja, rojo)

**Tab bar y contenido:**
- Tabs: "Dashboard" | "Cobros" (vista tabla/grid de todos los registros)
- Tab "Cobros": filtros (search, status, date range) + toggle list/grid + tabla con columnas (Número, Creadora, Tipo, Monto, Estado, Fecha) + vista grid con cards

**Modal "Registrar Nuevo Cobro" (según imagen 2):**
- Campos: Creadora (Select), Tipo de cobro (Select: Quincenal/Mensual), Monto ($), Estado (Select: Pagada/Pendiente/Vencida/Sin Cobro)
- Botones: Cancelar (outline) | Guardar (accent/verde)

**Archivo:** Reescribir `src/pages/finanzas/collections/CollectionsPage.tsx`

---

### 3. Control Financiero — Mejoras visuales

Problemas actuales: No tiene KPIs globales visibles, la tabla de "Ingresos vs Costos" es demasiado simple, no tiene toggle list/grid.

Cambios:
- Agregar 4 KPIs globales entre header y tab bar: Ingresos Totales, Egresos Totales, Balance, Margen %
- Remover los KPIs duplicados de dentro de los tabs "Ingresos vs Costos" y "Márgenes Operativos" (ya están en el nivel global)
- Agregar toggle list/grid en la barra de filtros (para tabs que muestran tablas: Costos por CC, Productividad)
- Vista grid para Costos por CC: cards con CC name, total y % 
- Vista grid para Productividad: cards con nombre, salario, horas, ratio
- Agregar search filter en cada tab con tabla

**Archivo:** Modificar `src/pages/finanzas/control/ControlFinancieroPage.tsx`

---

### 4. Reportes Avanzados — Contenido de tabs vacías

Problemas: Las tabs "Ventas por Creador", "Por Método de Pago" y "Comparativos Mensuales" filtran la misma tabla de reportes generados (sin contenido específico). Necesitan tablas con datos reales.

Cambios:
- **Tab "Ventas por Creador"**: Query de invoices agrupados por creator_id. Tabla con: Creador, Total Facturado, Total Cobrado, Pendiente, % del Total. Toggle list/grid.
- **Tab "Por Método de Pago"**: Query de invoices agrupados por payment_method. KPI cards por método + tabla de detalle. Toggle list/grid.
- **Tab "Comparativos Mensuales"**: Tabla de últimos 6 meses con: Mes, Ingresos, Egresos, Margen, % Cambio vs anterior. BarChart comparativo.
- **Tab "Estado de Cuenta CC"**: Mantener actual pero agregar toggle list/grid
- **Tab "Reportes Generales"**: Mantener actual, agregar toggle list/grid
- Agregar search y toggle list/grid en filtros globales

**Archivo:** Modificar `src/pages/finanzas/reportes/ReportesPage.tsx`

---

### 5. Facturación y Horas & Variables — Agregar toggle list/grid

- **FacturacionPage.tsx**: Agregar `viewMode` state y toggle en la barra de filtros del tab Invoices. Vista grid con cards mostrando invoice_number, creator, amount, status, fecha.
- **HorasVariablesPage.tsx**: Agregar `viewMode` state y toggle en cada tab. Vista grid para Horas Extra (cards por empleado), Banco de Horas (cards con status acumulado/pagado/compensado), Comisiones (cards con area, monto, status).

**Archivos:** Modificar `FacturacionPage.tsx` y `HorasVariablesPage.tsx`

---

### Resumen de archivos

| Archivo | Cambio |
|---------|--------|
| `DashboardSidebar.tsx` | Sacar Collections del grupo "Ingresos", ponerlo como item directo |
| `CollectionsPage.tsx` | Rediseño completo: layout de 4 filas + tab Dashboard/Cobros + modal actualizado + list/grid |
| `ControlFinancieroPage.tsx` | KPIs globales, quitar duplicados, toggle list/grid, search en tabs |
| `ReportesPage.tsx` | Contenido real en tabs vacías (Ventas por Creador, Método Pago, Comparativos), list/grid |
| `FacturacionPage.tsx` | Agregar toggle list/grid en tab Invoices |
| `HorasVariablesPage.tsx` | Agregar toggle list/grid en cada tab |

No se crean archivos nuevos. No se modifican rutas.

