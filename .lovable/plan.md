

## Plan

### 1. Mejorar layout de KPI Cards en Closers

El problema: 7 cards en `lg:grid-cols-7` quedan comprimidas. La solución es cambiar el grid a `lg:grid-cols-4` con las 7 cards distribuidas en 2 filas (4+3), y hacer las cards más compactas eliminando el subtitle y reduciendo el padding del icon.

**Archivo**: `src/pages/closers/components/ClosersKPICards.tsx`
- Cambiar grid de `lg:grid-cols-7` a `lg:grid-cols-4`
- Eliminar subtitles (redundantes con las tabs)
- Pasar a un layout más compacto dentro de cada card: icon más pequeño (h-8 w-8), value y label en menos espacio

**Archivo**: `src/components/dashboard/DashboardMetricCard.tsx`
- No se toca; el componente es compartido. En su lugar, crear un componente compacto inline dentro de `ClosersKPICards` o usar props de tamaño si ya existen.

Alternativa más limpia: hacer cards inline compactas directamente en `ClosersKPICards` sin depender de `DashboardMetricCard`, con icon + valor + label en una sola línea horizontal compacta.

### 2. Resumen de cambios del día

Se generará un resumen textual en la respuesta de implementación basado en el historial de la conversación.

### Cambios de hoy (resumen para incluir en respuesta):
1. **Política RLS INSERT** en `closer_creators` para permitir a usuarios autenticados insertar registros
2. **Eliminación del botón "Nueva Creator"** y modal manual — los leads solo entran via LeadGen
3. **DateRangePicker** agregado a MisCreatorsTab y PipelineTab
4. **Tab "Leads Disponibles"** creada (luego eliminada en siguiente iteración)
5. **Refactor completo**: Closers ahora lee directamente de `leadgen_entries` sin duplicar datos en `closer_creators`
6. **Nueva tabla tipo spreadsheet** con columnas: #, Instagram, Categoría, Fecha, Cuenta origen, Contactada?, Número, Notas, Onlyfans
7. **Tabs por status** filtrando directamente sobre `leadgen_entries.status`
8. **KPI cards** con conteos por status en tiempo real

