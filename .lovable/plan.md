

## Actualizar filtros del Sheet en Promolog

### Cambios a realizar en `src/pages/promolog/PromologContent.tsx`

### 1. Renombrar label del primer campo
Cambiar "Promociono?" a "¿Promociono?" (con signos de interrogacion en espanol).

### 2. Actualizar opciones del dropdown de estado
Reemplazar las opciones actuales por:
- Todos
- Si promociono
- No promociono
- Parcial
- Pendiente

### 3. Agregar busqueda en el dropdown de Modelo
Reemplazar el `Select` del campo "Modelo" por un componente `Popover` + `Command` (cmdk, ya instalado) que permita:
- Un input de busqueda para filtrar creators por nombre o alias
- Lista scrollable de creators filtrados
- Seleccion de un creator que cierra el popover y muestra el nombre seleccionado
- Estado local para el valor seleccionado y el termino de busqueda

### 4. Cargar categorias reales en "Categoria de Modelo"
Las categorias existentes en la base de datos son: A+, A, B+, B, C. Se agregara una query con `useQuery` para obtener las categorias distintas de la tabla `creators` y poblar el dropdown dinamicamente.

### Detalle Tecnico

**Archivo:** `src/pages/promolog/PromologContent.tsx`

**Cambio 1 - Label y opciones del primer campo (lineas 377-386):**
```tsx
<label className="text-sm font-medium">¿Promociono?</label>
<Select>
  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="__all__">Todos</SelectItem>
    <SelectItem value="si_promociono">Si promociono</SelectItem>
    <SelectItem value="no_promociono">No promociono</SelectItem>
    <SelectItem value="parcial">Parcial</SelectItem>
    <SelectItem value="pendiente">Pendiente</SelectItem>
  </SelectContent>
</Select>
```

**Cambio 2 - Modelo con busqueda (lineas 389-401):**
Reemplazar el Select por un Popover + Command (cmdk):
- Agregar imports: `Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem` desde `@/components/ui/command`
- Agregar imports: `Search` desde lucide-react
- Agregar estado local: `modeloSearch` para el termino de busqueda y `selectedCreator` para el valor seleccionado
- Filtrar creators por nombre o artistic_name segun el termino de busqueda
- Mostrar un boton trigger que muestra "Todas las modelos" o el nombre del creator seleccionado
- El Command mostrara la lista filtrable con CommandInput

**Cambio 3 - Categorias dinamicas (lineas 403-410):**
- Agregar una query para obtener categorias distintas:
```tsx
const { data: categories = [] } = useQuery({
  queryKey: ["creator-categories"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("creators")
      .select("category")
      .not("category", "is", null);
    if (error) throw error;
    const unique = [...new Set(data.map(d => d.category))].sort();
    return unique;
  },
});
```
- Poblar el dropdown con las categorias obtenidas:
```tsx
<SelectContent>
  <SelectItem value="__all__">Todas las categorias</SelectItem>
  {categories.map((cat) => (
    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
  ))}
</SelectContent>
```

