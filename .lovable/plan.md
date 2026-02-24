

## Reestructuracion del Modulo de Finanzas -- Navegacion y Distribucion

### Estado Actual vs Propuesto

```text
ACTUAL (sidebar plano)              PROPUESTO (arbol anidado estilo HR)
─────────────────────               ──────────────────────────────────────
Dashboard                           Nomina
Nomina                              Comisiones Laborales
Facturacion                         Horas & Banco de Horas
Comisiones                          Facturacion
Control Financiero                  Control Financiero
Reportes                            Reportes
                                    Configuracion Financiera
```

---

### Estrategia de Distribucion

Cada seccion del sidebar sera una **ruta/pagina**. Los sub-items del arbol se implementan como **tabs internas** dentro de cada pagina (mismo patron que Comisiones ya usa con "En Tiempo Real / Proyeccion / Historial Batch"). Esto evita explosion de rutas y mantiene el patron existente.

---

### Sidebar: Estructura Anidada (patron HR con collapsibles)

Se reemplazara el listado plano actual por el patron de `hrGroups` con collapsibles anidados:

```text
Finanzas (icono: Wallet)
  |
  +-- Dashboard Financiero          /finanzas
  |
  +-- [Operaciones]  (collapsible, icono: Calculator)
  |     +-- Nomina                  /finanzas/nomina
  |     +-- Comisiones Laborales    /finanzas/comisiones
  |     +-- Horas & Banco de Horas  /finanzas/horas
  |
  +-- [Facturacion]  (collapsible, icono: FileText)
  |     +-- Invoices                /finanzas/facturacion
  |
  +-- [Analisis]  (collapsible, icono: BarChart3)
  |     +-- Control Financiero      /finanzas/control
  |     +-- Reportes                /finanzas/reportes
  |
  +-- [Configuracion]  (collapsible, icono: Settings)
        +-- Config. Financiera      /finanzas/configuracion
```

Implementacion tecnica: Replicar el patron `hrGroups` con type `FinanzasGroup` (label, icon, key, items) y renderizado con `Collapsible > SidebarMenuSub`.

---

### Tabs Internas por Pagina

**Nomina** (`/finanzas/nomina`) -- Tabs:
- Calculo de Nomina (vista actual de periodos)
- Tiempo Real (proyeccion en vivo)
- Batch (lotes de nomina)
- Recibos de Pago
- Archivos Bancarios (PagoMundo / bancos)

**Comisiones Laborales** (`/finanzas/comisiones`) -- Tabs (ya existen parcialmente):
- En Tiempo Real (ya existe)
- Proyeccion (ya existe)
- Historial Batch / QuickBooks (ya existe)

**Horas & Banco de Horas** (`/finanzas/horas`) -- **NUEVA PAGINA** -- Tabs:
- Horas Extra (vista financiera: costo por hora extra)
- Banco de Horas (saldos y valoracion)

**Facturacion** (`/finanzas/facturacion`) -- Tabs:
- Invoices (vista actual)
- Envio Masivo
- Notas de Pago
- Reversos
- Fees & Ajustes

**Control Financiero** (`/finanzas/control`) -- Tabs:
- Ingresos vs Costos (vista actual)
- Costos por Centro de Costo
- Productividad por Empleado
- Margenes Operativos

**Reportes** (`/finanzas/reportes`) -- Tabs:
- Ganancias & Comisiones
- Ventas por Creador
- Ventas Generales
- Estado de Cuenta por CC
- Comparativos Mensuales
- Por Metodo de Pago

**Configuracion Financiera** (`/finanzas/configuracion`) -- **NUEVA PAGINA** -- Tabs:
- Templates QuickBooks
- Metodos de Pago
- Centros de Costo
- Configuracion de Comisiones
- Parametros de Nomina

---

### Archivos a Crear

| Archivo | Descripcion |
|---------|-------------|
| `src/pages/finanzas/horas/HorasPage.tsx` | Nueva pagina: Horas extra y banco de horas (perspectiva financiera) |
| `src/pages/finanzas/configuracion/ConfiguracionPage.tsx` | Nueva pagina: Configuracion de parametros financieros |

### Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/dashboard/DashboardSidebar.tsx` | Reemplazar listado plano de Finanzas por estructura anidada con collapsibles (patron HR) |
| `src/pages/finanzas/nomina/NominaPage.tsx` | Agregar tab bar con 5 tabs (Calculo, Tiempo Real, Batch, Recibos, Archivos Bancarios). Contenido actual queda en tab "Calculo". Tabs restantes con placeholder |
| `src/pages/finanzas/facturacion/FacturacionPage.tsx` | Agregar tab bar con 5 tabs (Invoices, Envio Masivo, Notas de Pago, Reversos, Fees). Contenido actual en tab "Invoices". Tabs restantes con placeholder |
| `src/pages/finanzas/control/ControlFinancieroPage.tsx` | Agregar tab bar con 4 tabs (Ingresos vs Costos, Costos por CC, Productividad, Margenes). Contenido actual en tab 1 |
| `src/pages/finanzas/reportes/ReportesPage.tsx` | Agregar tab bar con 6 tabs (tipos de reporte). Contenido actual se mantiene, tabs filtran por tipo |
| `src/App.tsx` | Agregar 2 rutas: `/finanzas/horas` y `/finanzas/configuracion` |

### Archivos que NO cambian

- `src/pages/finanzas/comisiones/ComisionesPage.tsx` -- Ya tiene tabs correctas
- `src/pages/finanzas/FinanzasDashboard.tsx` -- Se mantiene igual
- `src/pages/finanzas/FinanzasLayout.tsx` -- Se mantiene igual

---

### Patron de Tabs (reutilizado)

Todas las tabs usaran el patron existente del sistema:

```text
<div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
  {TABS.map(t => (
    <Button variant={activeTab === t ? "secondary" : "ghost"} size="sm" ...>
      {t}
    </Button>
  ))}
</div>
```

El contenido de cada tab se renderiza condicionalmente debajo. Las tabs que aun no tengan logica real mostraran un placeholder consistente:

```text
<div className="rounded-lg border border-dashed border-border p-12 text-center">
  <p className="text-sm text-muted-foreground">Proximamente: {tabName}</p>
</div>
```

---

### No se requieren migraciones SQL

Las tablas existentes (`payroll_periods`, `payroll_details`, `invoices`, `commissions`, `financial_reports`) cubren toda la informacion. La nueva pagina de Horas consultara las columnas `overtime_hours`, `overtime_amount`, `hour_bank_hours`, `hour_bank_amount` de `payroll_details`. La pagina de Configuracion gestionara parametros que se pueden almacenar en las mismas tablas existentes o como constantes en el frontend inicialmente.

