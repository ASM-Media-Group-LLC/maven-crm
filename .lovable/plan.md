

## Migrar KPIs a DashboardMetricCard y agregar "Alertas Criticas"

### Resumen

Se reemplazaran las 4 tarjetas KPI actuales (Card + CardContent manuales) por el componente estandarizado `DashboardMetricCard` que ya existe en el proyecto, y se agregara una quinta tarjeta "Alertas Criticas" que muestra solicitudes con estado "pendiente" que han superado su fecha limite (no enviadas a tiempo).

### Cambios en un solo archivo

**Archivo:** `src/pages/creadores/personalizados/PersonalizadosPage.tsx`

### 1. Nuevos imports

- Agregar `DashboardMetricCard` desde `@/components/dashboard/DashboardMetricCard`
- Agregar iconos de Lucide: `FileText`, `Clock`, `Loader`, `CheckCircle`, `AlertTriangle`

### 2. Nueva metrica: "Alertas Criticas"

Calcular solicitudes "no enviadas" como aquellas con `status === "pendiente"` cuya `due_date` ya paso (fecha limite vencida):

```typescript
const alertas = requests.filter(
  (r) => r.status === "pendiente" && r.due_date && new Date(r.due_date) < new Date()
).length;
```

### 3. Reemplazar grid de KPIs

Cambiar el bloque actual de `<Card>` manuales (lineas 81-95) por un grid de 5 columnas usando `DashboardMetricCard`:

```text
grid grid-cols-2 md:grid-cols-5 gap-4
```

Las 5 tarjetas seran:

| Label | Valor | Icono | Color |
|---|---|---|---|
| Total Solicitudes | total | FileText | primary |
| Pendientes | pendientes | Clock | warning |
| En Progreso | enProgreso | Loader | accent |
| Completadas | completadas | CheckCircle | success |
| Alertas Criticas | alertas | AlertTriangle | destructive |

La tarjeta de "Alertas Criticas" usara el color `destructive` del DashboardMetricCard, que aplica automaticamente el tono rojo sutil en dark mode (icono rojo, valor rojo, hover con gradiente rojo). Ademas incluira un `subtitle` condicional: si hay alertas mostrara "Solicitudes vencidas", si no mostrara "Sin alertas".

### Resultado visual

Las tarjetas tendran el mismo estilo estandarizado del resto de la plataforma: icono con fondo semitransparente, efecto hover con escala y gradiente, y colores semanticos consistentes con el dark mode existente.
