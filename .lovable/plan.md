
# Renombrar secciones en el sidebar

## Cambios en `src/components/dashboard/DashboardSidebar.tsx`

Dos renombramientos en el archivo de configuracion del sidebar:

1. **Linea 51**: Cambiar `"Dashboard"` a `"Sales Report"` (sub-item de Creator Sales que apunta a `/salesdashboard`)
2. **Linea 52**: Cambiar `"Sales Report"` a `"Sale Report v.1"` (sub-item que apunta a `/salesperformancecreator`)

Resultado final del array `creatorSalesSubItems`:
```text
Overview          -> /sales-overview
Sales Report      -> /salesdashboard          (antes "Dashboard")
Sale Report v.1   -> /salesperformancecreator  (antes "Sales Report")
AI Sales          -> /aisales
AI Config         -> /ai-sales-config
```

## Archivos a modificar
- `src/components/dashboard/DashboardSidebar.tsx` (2 lineas)
