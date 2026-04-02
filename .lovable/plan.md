

## Plan: Sección de Auditoría de Ventas

### Contexto
Tienes un reporte Excel externo (Marzo 2026) y datos en la base de datos (`of_gross_earnings`). Necesitas comparar ambas fuentes para identificar diferencias en los totales por creadora y decidir qué número es el correcto.

### Arquitectura

```text
Sidebar: Creator Sales
  ├── Dashboard
  ├── Reportes
  ├── IA Ventas
  └── Auditoría  ← NUEVO
```

### Implementación

#### 1. Nueva página `src/pages/SalesAudit.tsx`
- Página con sidebar y topbar estándar del dashboard
- Header: "Auditoría de Ventas" con descripción
- Dos secciones principales:
  - **Carga de archivo**: Dropzone para subir el Excel externo (.xlsx)
  - **Tabla de comparación**: Se genera al cargar el archivo

#### 2. Componente `src/pages/sales-audit/AuditComparisonTable.tsx`
- Parsea el Excel subido con la librería `xlsx` (ya instalada en el proyecto)
- Agrupa por creadora sumando `Total earnings Gross` del Excel
- Consulta la DB vía Supabase para el mismo rango de fechas (Marzo 2026) agrupado por `pending_creator`
- Genera tabla comparativa con columnas:
  - Creadora
  - Total Excel (Gross)
  - Total Sistema (Gross)
  - Diferencia ($)
  - Diferencia (%)
  - Estado: badge verde "OK" si coincide (±$1 tolerancia), badge rojo "Diferencia" si no
  - Acción: botón para marcar "Validado" con el valor que se queda

#### 3. Componente `src/pages/sales-audit/AuditSummaryCards.tsx`
- Tarjetas resumen arriba de la tabla:
  - Total Excel vs Total Sistema
  - Creadoras con diferencias
  - Creadoras que coinciden
  - Diferencia neta total

#### 4. Lógica de validación
- Al hacer click en "Usar Excel" o "Usar Sistema", se marca visualmente cuál valor se conserva
- Estado local (no persiste en DB por ahora) — se puede exportar el resultado final como Excel con las decisiones tomadas
- Botón "Exportar Auditoría" genera un Excel con la comparación y las decisiones

#### 5. Routing y navegación
- Agregar ruta `/sales-audit` en `App.tsx` con `PermissionRoute module="Creator Sales"`
- Agregar item "Auditoría" al array `creatorSalesSubItems` en `DashboardSidebar.tsx`

### Archivos a crear/modificar
| Archivo | Acción |
|---------|--------|
| `src/pages/SalesAudit.tsx` | Crear - página principal |
| `src/pages/sales-audit/AuditComparisonTable.tsx` | Crear - tabla comparativa |
| `src/pages/sales-audit/AuditSummaryCards.tsx` | Crear - tarjetas resumen |
| `src/App.tsx` | Modificar - agregar ruta |
| `src/components/dashboard/DashboardSidebar.tsx` | Modificar - agregar item menú |

### Detalles técnicos
- El matching de creadoras entre Excel y DB se hará por nombre normalizado (lowercase, trim) ya que el Excel usa la columna "Creator" y la DB usa `pending_creator`
- El rango de fechas se detectará automáticamente del Excel (min/max de la columna Date)
- Se usa la librería `xlsx` ya disponible en el proyecto para parsear el archivo subido

