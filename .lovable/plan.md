

## Filtros de Progreso en Onboarding

### Archivo a modificar

**`src/pages/creadores/onboarding/OnboardingContent.tsx`**

### Cambios

#### 1. Nuevos estados de filtro

Agregar dos nuevos estados al componente:

- `statusFilter`: string con valores `"Todas" | "Pendientes" | "En Progreso" | "Completados"`, default `"Todas"`
- `stepFilter`: string con valores `"" | "1" | "2" | "3" | "4"`, default `""`

#### 2. Pills de estado (debajo de KPIs, encima de los tabs de agencia)

Insertar una fila de botones tipo pill justo despues de las KPI cards (linea 91) y antes de la seccion del wizard/list (linea 93), siguiendo el patron estandar de tabs:

```text
<div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
  <Button size="sm" variant={statusFilter === "Todas" ? "secondary" : "ghost"} ...>Todas</Button>
  <Button size="sm" variant={statusFilter === "Pendientes" ? "secondary" : "ghost"} ...>Pendientes</Button>
  <Button size="sm" variant={statusFilter === "En Progreso" ? "secondary" : "ghost"} ...>En Progreso</Button>
  <Button size="sm" variant={statusFilter === "Completados" ? "secondary" : "ghost"} ...>Completados</Button>
</div>
```

#### 3. Dropdown "Etapa del Proceso" (junto al buscador)

Importar `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` desde `@/components/ui/select`.

Agregar un dropdown en la barra de filtros (linea 118-136), al lado del Input de busqueda:

```text
<Select value={stepFilter || undefined} onValueChange={(v) => setStepFilter(v === "__all__" ? "" : v)}>
  <SelectTrigger className="w-[200px]">
    <SelectValue placeholder="Etapa del Proceso" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="__all__">Todas las etapas</SelectItem>
    <SelectItem value="1">Paso 1: Datos Personales</SelectItem>
    <SelectItem value="2">Paso 2: Perfil Psicologico</SelectItem>
    <SelectItem value="3">Paso 3: Documentacion</SelectItem>
    <SelectItem value="4">Paso 4: Configuracion Comercial</SelectItem>
  </SelectContent>
</Select>
```

Tambien agregar un boton "Limpiar filtros" visible cuando hay filtros activos (statusFilter distinto de "Todas", stepFilter no vacio, o search no vacio).

#### 4. Actualizar la logica de filtrado

Modificar el `useMemo` de `filtered` (lineas 25-35) para incluir los nuevos filtros:

```text
const filtered = useMemo(() => {
  let list = creators;
  // Filtro por agencia
  if (activeTab !== "Todas") {
    list = list.filter((c) => c.company.toLowerCase() === activeTab.toLowerCase());
  }
  // Filtro por estado
  if (statusFilter !== "Todas") {
    list = list.filter((c) => c.status === statusFilter);
  }
  // Filtro por etapa del proceso
  if (stepFilter) {
    list = list.filter((c) => String(calculateCurrentStep(c)) === stepFilter);
  }
  // Filtro por busqueda
  if (search) {
    const q = search.toLowerCase();
    list = list.filter((c) => c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q));
  }
  return list;
}, [creators, activeTab, statusFilter, stepFilter, search]);
```

#### 5. Jerarquia visual final

El orden de elementos en la seccion de contenido quedara asi:

1. KPI Cards (Total, Pendientes, En Progreso, Completados)
2. Pills de estado (Todas, Pendientes, En Progreso, Completados) -- nuevo
3. Tabs de agencia (Todas, Atomic Agency, Elite Models, ...)
4. Barra de filtros: Buscador + Dropdown "Etapa del Proceso" + Limpiar filtros + Toggle vista
5. Tabla o Grid de resultados

### Imports adicionales

- `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` desde `@/components/ui/select`
- `X` desde `lucide-react` (para el boton de limpiar filtros)

