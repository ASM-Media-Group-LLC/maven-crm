

## Dos correcciones: Tab bar debajo de las KPI cards + Fix build error

### 1. Mover tab bar debajo de las KPI cards en Nomina

**Problema:** En `NominaPage.tsx`, el tab bar esta en la linea 345 como primer elemento del contenido. Pero las KPI cards de "Calculo de Nomina" estan dentro de `renderTabContent()` (linea 211). El usuario quiere que las KPI cards aparezcan primero y el tab bar despues.

**Solucion:** Extraer las KPI cards del tab "Calculo de Nomina" fuera de `renderTabContent()` y colocarlas **antes** del tab bar en el JSX principal. Solo se muestran cuando `nominaTab === "Calculo de Nomina"` (o siempre, ya que son KPIs globales de nomina).

**Cambio en `NominaPage.tsx` (lineas 344-350):**

```text
ANTES:
  [Tab bar]
  [renderTabContent() -- que incluye KPIs dentro del case default]

DESPUES:
  [KPI cards -- siempre visibles como resumen global]
  [Tab bar]
  [renderTabContent() -- sin las KPI cards duplicadas]
```

Se moveran las 4 KPI cards (lineas 211-219) fuera del `renderTabContent` al JSX principal, antes del tab bar. Se eliminaran del case default para evitar duplicacion.

### 2. Fix build error en ControlFinancieroPage.tsx

**Problema:** La query en linea 65 selecciona `net_amount` que no existe en `payroll_details`. La columna correcta es `net_total`.

**Cambios en `ControlFinancieroPage.tsx`:**
- Linea 65: cambiar `net_amount` a `net_total` en la query `.select()`
- Linea 89: cambiar `d.net_amount` a `d.net_total` en el reduce

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/finanzas/nomina/NominaPage.tsx` | Mover KPI cards antes del tab bar |
| `src/pages/finanzas/control/ControlFinancieroPage.tsx` | Corregir `net_amount` -> `net_total` (2 ocurrencias) |

