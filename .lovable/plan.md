

## Estandarizar la estructura de las páginas de Finanzas

Todas las páginas del módulo de Finanzas deben seguir el mismo orden jerárquico definido en el Sistema de Diseño:

```text
1. Header (título + CTAs)
2. KPIs de resumen (globales, siempre visibles)
3. Tab bar de navegación
4. Filtros (buscador, selects, date range)
5. Contenido de la tab activa
```

Actualmente solo **Nómina** sigue este orden. Las demás páginas tienen los KPIs **dentro** del contenido de tabs individuales, lo que rompe la consistencia y hace que los KPIs desaparezcan al cambiar de tab.

---

### Cambios por página

**1. Facturación (`FacturacionPage.tsx`)**
- Mover los 4 KPI cards (Total Invoices, Pendientes, Monto Total, Fee Total) **fuera** del `renderTabContent()` case "Invoices"
- Colocarlos en el JSX principal, entre el header y el tab bar
- Los KPIs se calculan sobre todos los invoices (ya lo hacen), así que son globales

**2. Collections (`CollectionsPage.tsx`)**
- Mover los 4 KPI cards + PieChart del tab "Dashboard de Cobros" **fuera** del tab content
- Los KPIs (Total Cobrado, Pendiente, Vencido, Sin Cobro) van entre header y tab bar como resumen global
- El PieChart se queda dentro del tab "Dashboard de Cobros" (es contenido específico de esa vista)

**3. Horas & Variables (`HorasVariablesPage.tsx`)**
- Agregar KPIs globales entre header y tab bar: Total Horas Extra, Banco de Horas Acumuladas, Total Comisiones, Empleados Activos
- Los KPIs específicos de cada tab (detalle por tipo) se mantienen dentro del contenido del tab
- Esto da una vista rápida sin importar qué tab está activa

**4. Control Financiero (`ControlFinancieroPage.tsx`)**
- Mover el DateRangePicker que está inline con el tab bar a una línea separada debajo del tab bar (consistencia con las demás páginas)
- No tiene KPIs globales, está correcto

**5. Reportes (`ReportesPage.tsx`)**
- Sin KPIs globales, estructura correcta. Sin cambios.

**6. Configuración (`ConfiguracionPage.tsx`)**
- Placeholder tabs, estructura correcta. Sin cambios.

---

### Resumen de archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `FacturacionPage.tsx` | Extraer 4 KPIs del tab "Invoices" al nivel global (antes del tab bar) |
| `CollectionsPage.tsx` | Extraer 4 KPIs del tab "Dashboard" al nivel global (antes del tab bar) |
| `HorasVariablesPage.tsx` | Agregar 4 KPIs globales entre header y tab bar |
| `ControlFinancieroPage.tsx` | Separar DateRangePicker del tab bar a su propia línea |

No se crean archivos nuevos. No se modifican rutas ni sidebar.

