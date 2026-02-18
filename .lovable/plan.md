

## Mejoras en Promolog: Selector de Mes, Filtros en Agentes y Campanas

### 1. Selector de Mes/Ano en Nueva Campana

**Problema:** El calendario actual permite seleccionar un dia individual, pero la campana es mensual y solo necesita mes y ano.

**Solucion:** Reemplazar el `Calendar` por un selector manual con dos `Select` (uno para mes, otro para ano). Al seleccionar ambos, se construye la fecha internamente. El trigger sigue siendo un `Button` con `CalendarIcon` mostrando "Febrero 2026".

**Implementacion:**
- Dentro del `PopoverContent` del mes/ano (lineas 1088-1097), reemplazar `Calendar` por dos selects en fila:
  - Select de mes: Enero a Diciembre
  - Select de ano: rango dinamico (ano actual - 1 hasta ano actual + 2)
- Al seleccionar ambos, se construye `new Date(year, monthIndex, 1)` y se cierra el popover

---

### 2. Agentes: Mover toggle de vista y agregar filtros

**Problema:** El toggle List/Grid esta dentro del banner gradient (lineas 598-605), lo cual es inconsistente con el patron de Promos donde esta en la fila de filtros.

**Solucion:** Eliminar el toggle del banner y agregar una fila de filtros debajo del banner con:
- Buscador (`max-w-xs`, busca por nombre de agente)
- DateRangePicker (reutiliza `dateFrom`/`dateTo` globales)
- Boton "Limpiar filtros" condicional
- Toggle List/Grid alineado a la derecha (`ml-auto`)

**Cambios en lineas 586-681:**
- Eliminar el bloque de botones List/Grid del banner (lineas 597-605)
- Agregar estado `searchAgent` para el buscador
- Insertar fila de filtros despues del banner con el mismo patron visual que Promos (linea 517)
- Filtrar `agentsData` por nombre segun `searchAgent`

---

### 3. Campanas: Agregar filtros completos

**Problema:** La pestana Campanas solo tiene un titulo y el toggle de vista, sin buscador ni filtros.

**Solucion:** Reemplazar la estructura actual (lineas 685-706) por una fila de filtros unificada con:
- Buscador (`max-w-xs`, busca por nombre de creadora de la campana)
- Select de estado (Activa, Finalizada, Pendiente)
- DateRangePicker
- Boton "Limpiar filtros" condicional
- Toggle List/Grid alineado a la derecha (`ml-auto`)
- Eliminar el encabezado h2 redundante (ya esta en las tabs)

**Cambios en lineas 684-706:**
- Agregar estados `searchCampaign` y `campaignStatusFilter`
- Reemplazar el layout actual por la fila de filtros estandar

---

### Seccion tecnica

**Archivo:** `src/pages/promolog/PromologContent.tsx`

**Nuevos estados:**
```text
const [searchAgent, setSearchAgent] = useState("");
const [searchCampaign, setSearchCampaign] = useState("");
const [campaignStatusFilter, setCampaignStatusFilter] = useState("");
```

**Selector de Mes/Ano (reemplaza Calendar en lineas 1088-1097):**
```text
<PopoverContent className="w-auto p-4" align="start">
  <div className="flex items-center gap-2">
    <Select value={mes} onValueChange={setMes}>
      <SelectTrigger className="w-[130px]">
        <SelectValue placeholder="Mes" />
      </SelectTrigger>
      <SelectContent>
        {meses.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
      </SelectContent>
    </Select>
    <Select value={ano} onValueChange={setAno}>
      <SelectTrigger className="w-[100px]">
        <SelectValue placeholder="Ano" />
      </SelectTrigger>
      <SelectContent>
        {anos.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
</PopoverContent>
```

**Fila de filtros para Agentes (despues del banner, linea 616):**
```text
<div className="flex items-center gap-3 flex-wrap">
  <div className="relative flex-1 max-w-xs">
    <Search .../> <Input placeholder="Buscar agente..." />
  </div>
  <DateRangePicker from={dateFrom} to={dateTo} onApply={...} />
  {hasFilters && <Button>Limpiar filtros</Button>}
  <div className="ml-auto flex gap-1">
    <Button List/> <Button Grid/>
  </div>
</div>
```

**Fila de filtros para Campanas (reemplaza lineas 687-699):**
```text
<div className="flex items-center gap-3 flex-wrap">
  <div className="relative flex-1 max-w-xs">
    <Search .../> <Input placeholder="Buscar campana..." />
  </div>
  <Select estado />
  <DateRangePicker />
  {hasFilters && <Button>Limpiar filtros</Button>}
  <div className="ml-auto flex gap-1">
    <Button List/> <Button Grid/>
  </div>
</div>
```

