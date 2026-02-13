

## Actualizar categorias y funcionalidad de filtros en Promolog

### Cambios a realizar en `src/pages/promolog/PromologContent.tsx`

### 1. Categorias con labels descriptivos
Reemplazar la renderizacion dinamica de categorias (lineas 448-452) por opciones fijas con labels descriptivos segun la imagen:
- A+ - Excelente
- A - Muy buena
- B+ - Buena plus
- B - Buena
- C - Regular

Se eliminara la query dinamica de categorias (`creator-categories`) ya que las opciones son fijas.

### 2. Estado controlado para todos los filtros
Agregar estados para cada filtro:
- `selectedStatus` (string) - para "¿Promociono?"
- `selectedCategory` (string) - para "Categoria de Modelo"  
- `selectedNetwork` (string) - para "Red Social"
- `selectedCreator` ya existe

Conectar cada Select con su estado usando `value` y `onValueChange`.

### 3. Funcionalidad "Limpiar filtros"
El boton "Limpiar filtros" reseteara todos los estados a sus valores por defecto (cadena vacia o "__all__").

### 4. Funcionalidad "Aplicar filtros"
El boton "Aplicar filtros" cerrara el Sheet y filtrara las entradas (`mockEntries`) segun los valores seleccionados:
- Filtrar por `result` segun el estado seleccionado
- Filtrar por `name`/creator segun el modelo seleccionado
- Filtrar por `network` segun la red social seleccionada
- La categoria de modelo no aplica directamente a las entradas mock por ahora, pero el estado quedara listo

Se agregara un estado `appliedFilters` que se actualiza al hacer clic en "Aplicar filtros", y las entradas mostradas se filtraran segun esos filtros aplicados.

### Detalle Tecnico

**Archivo:** `src/pages/promolog/PromologContent.tsx`

**Nuevos estados (despues de linea 191):**
```tsx
const [selectedStatus, setSelectedStatus] = useState("__all__");
const [selectedCategory, setSelectedCategory] = useState("__all__");
const [selectedNetwork, setSelectedNetwork] = useState("__all__");

// Filtros aplicados (se actualizan al hacer clic en "Aplicar")
const [appliedFilters, setAppliedFilters] = useState({
  status: "__all__",
  creator: "",
  category: "__all__",
  network: "__all__",
});
```

**Logica de filtrado:**
```tsx
const filteredEntries = mockEntries.filter((entry) => {
  if (appliedFilters.status !== "__all__") {
    const statusMap: Record<string, string> = {
      si_promociono: "Si",
      no_promociono: "No",
      parcial: "Parcial",
      pendiente: "Pendiente",
    };
    if (entry.result !== statusMap[appliedFilters.status]) return false;
  }
  if (appliedFilters.creator && entry.id) {
    // Filtrar por creator name match
  }
  if (appliedFilters.network !== "__all__" && entry.network !== appliedFilters.network) return false;
  return true;
});
```

**Categorias fijas (reemplazar lineas 448-452):**
```tsx
<SelectContent>
  <SelectItem value="__all__">Todas las categorias</SelectItem>
  <SelectItem value="A+">A+ - Excelente</SelectItem>
  <SelectItem value="A">A - Muy buena</SelectItem>
  <SelectItem value="B+">B+ - Buena plus</SelectItem>
  <SelectItem value="B">B - Buena</SelectItem>
  <SelectItem value="C">C - Regular</SelectItem>
</SelectContent>
```

**Limpiar filtros (linea 473):**
```tsx
<Button variant="outline" className="w-full" onClick={() => {
  setSelectedStatus("__all__");
  setSelectedCreator("");
  setSelectedCategory("__all__");
  setSelectedNetwork("__all__");
}}>Limpiar filtros</Button>
```

**Aplicar filtros (linea 474):**
```tsx
<Button className="w-full" onClick={() => {
  setAppliedFilters({
    status: selectedStatus,
    creator: selectedCreator,
    category: selectedCategory,
    network: selectedNetwork,
  });
  setFiltersOpen(false);
}}>Aplicar filtros</Button>
```

**Eliminar:** La query `creator-categories` (lineas 174-185) ya no sera necesaria ya que las categorias son fijas.

