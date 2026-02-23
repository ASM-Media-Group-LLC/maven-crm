

## Limpiar y Unificar la Interfaz de Onboarding

### Archivo a modificar

**`src/pages/creadores/onboarding/OnboardingContent.tsx`**

### Cambios

#### 1. Hacer las KPI Cards clickeables como filtros maestros

Las 4 tarjetas (Total, Pendientes, En Progreso, Completados) pasaran a funcionar como filtros de estado. Al hacer clic en una, se actualizara `statusFilter` con el valor correspondiente. La card activa tendra un borde o anillo visual para indicar la seleccion.

- Envolver cada `DashboardMetricCard` en un `div` con `onClick` y `cursor-pointer`
- Agregar un anillo visual (`ring-2 ring-primary`) a la card seleccionada
- "Total" reseteara el filtro a `"Todas"`
- El `DashboardMetricCard` ya acepta `hoverClass`, se usara para pasar estilos condicionales

#### 2. Eliminar las dos filas de botones pills

Eliminar completamente:
- La fila de **Status Pills** (lineas 124-136): "Todas, Pendientes, En Progreso, Completados"
- La fila de **Area Tabs** (lineas 138-150): "Todas, Atomic Agency, Elite Models, ..."

Tambien eliminar la constante `statusTabs` (linea 16) y `areaTabs` (linea 15).

#### 3. Convertir agencias en dropdown

Reemplazar los botones de agencias por un `Select` dropdown con las mismas opciones, usando el patron estandar `__all__` para "Todas".

#### 4. Consolidar en una sola barra de filtros

Una unica fila horizontal con este orden:
1. **Buscador** (Input con icono Search)
2. **Dropdown Agencia** (Select, w-[180px])
3. **Dropdown Etapa del Proceso** (Select, w-[220px], ya existente)
4. **Limpiar filtros** (Button ghost, condicional)
5. **Toggle vista Lista/Grid** (al extremo derecho, con `ml-auto`)

#### 5. Actualizar logica de filtros activos y limpieza

`hasActiveFilters` ahora incluira `activeTab !== "Todas"` ademas de los filtros existentes. `clearFilters` reseteara tambien `activeTab` a `"Todas"`.

### Resultado visual

```text
[Header: Onboarding + Boton "Iniciar Onboarding"]
[KPI: Total* | Pendientes | En Progreso | Completados]  <-- clickeables
[Buscar... | Agencia v | Etapa v | Limpiar filtros | [Lista|Grid]]
[Tabla o Grid de resultados]
```

### Detalle tecnico

```text
// KPI Cards clickeables (reemplazando lineas 107-112):
const kpiCards = [
  { label: "Total", value: total, icon: Users, filter: "Todas", valueColor: undefined },
  { label: "Pendientes", value: pending, icon: Clock, filter: "Pendientes", valueColor: "text-amber-500" },
  { label: "En Progreso", value: inProgress, icon: Loader2, filter: "En Progreso", valueColor: "text-blue-500" },
  { label: "Completados", value: completed, icon: CheckCircle2, filter: "Completados", valueColor: "text-emerald-500" },
];

// Render:
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
  {kpiCards.map((kpi) => (
    <div key={kpi.label} onClick={() => setStatusFilter(kpi.filter)} className="cursor-pointer">
      <DashboardMetricCard
        label={kpi.label}
        value={String(kpi.value)}
        icon={kpi.icon}
        valueColor={kpi.valueColor}
        hoverClass={statusFilter === kpi.filter ? "ring-2 ring-primary" : "hover:shadow-md"}
      />
    </div>
  ))}
</div>

// Barra de filtros unificada (una sola linea):
<div className="flex items-center gap-3">
  <div className="relative max-w-sm flex-1">
    <Search ... />
    <Input placeholder="Buscar por nombre o empresa..." ... />
  </div>

  <Select value={activeTab === "Todas" ? undefined : activeTab} onValueChange={...}>
    <SelectTrigger className="w-[180px]">
      <SelectValue placeholder="Agencia" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="__all__">Todas las agencias</SelectItem>
      <SelectItem value="Atomic Agency">Atomic Agency</SelectItem>
      ...
    </SelectContent>
  </Select>

  <Select value={stepFilter || undefined} onValueChange={...}>
    ...Etapa del Proceso (sin cambios)
  </Select>

  {hasActiveFilters && <Button variant="ghost" ...>Limpiar filtros</Button>}

  <div className="ml-auto flex items-center gap-1 rounded-lg border p-1">
    ...toggle vista (sin cambios)
  </div>
</div>
```

