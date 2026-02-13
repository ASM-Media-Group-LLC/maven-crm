
## Objetivo
Hacer que el badge de "Calidad" en la tabla de Leads sea un dropdown interactivo que permita cambiar la categoría del lead directamente desde la tabla sin abrir un modal separado.

## Contexto Actual
- `LeadGenTable.tsx` (línea 155-162): Muestra el badge de calidad con un `ChevronDown` que visualmente sugiere interactividad, pero no está funcional.
- `LeadGenContent.tsx`: Usa `useQuery` para cargar los leads desde Supabase, pero no tiene un callback para actualizar la categoría.
- El patrón de actualización existe en el codebase (ver `useCreadores.ts` línea 159-162): usa `useMutation` con `supabase.from("table").update(data).eq("id", id)`.

## Solución Propuesta

### 1. Crear un Hook `useUpdateLeadCategoria`
Crear un nuevo hook en `src/pages/leadgen/useLeadGen.ts` (o similar) que:
- Use `useMutation` de TanStack Query para actualizar la categoría
- Ejecute `supabase.from("leads").update({ categoria }).eq("id", leadId)`
- Invalide el queryKey de "leads" después de actualizar para refrescar la tabla

### 2. Modificar `LeadGenTable.tsx`
Reemplazar la celda de Calidad (línea 155-162) con:
- Un componente renderizado con `DropdownMenu` en lugar del `div` simple
- El trigger será el badge existente
- El contenido del dropdown tendrá 5 items: A+, A, B+, B, C
- Cada item ejecutará la mutación al hacer click
- Agregar prop `onCategoriaChange?: (leadId: string, newCategoria: string) => void` al componente (o directamente usar el hook dentro del componente)

### 3. Integrar la mutación en `LeadGenContent.tsx`
Importar el hook `useUpdateLeadCategoria` y:
- Pasar una función callback a `LeadGenTable` que ejecute la mutación
- O directamente usar el hook dentro de `LeadGenTable` para evitar prop drilling

## Archivos a Modificar

**Crear:**
- `src/pages/leadgen/useLeadGen.ts` (nuevo hook con `useUpdateLeadCategoria`)

**Modificar:**
- `src/pages/leadgen/LeadGenTable.tsx` -- Reemplazar la celda de Calidad (línea 155-162) con un DropdownMenu interactivo. Importar el hook y ejecutar la mutación al cambiar la categoría.
- `src/pages/leadgen/LeadGenContent.tsx` -- Pasar el callback necesario a `LeadGenTable` si es necesario (opcional si se usa el hook directamente).

## Detalles Técnicos

**Hook `useUpdateLeadCategoria`:**
```tsx
export const useUpdateLeadCategoria = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, categoria }: { id: string; categoria: string }) => {
      const { error } = await supabase.from("leads").update({ categoria }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
};
```

**Dropdown en LeadGenTable:**
```tsx
<TableCell>
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="sm" className="h-8 -ml-2 flex items-center gap-1">
        <Badge variant={calidadVariant[cat] ?? "secondary-soft"}>
          {lead.categoria.toUpperCase()}
        </Badge>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      {["a+", "a", "b+", "b", "c"].map((cat) => (
        <DropdownMenuItem
          key={cat}
          onClick={() => mutation.mutate({ id: lead.id, categoria: cat })}
        >
          {cat.toUpperCase()}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
</TableCell>
```

**Constraint del Design System:**
- Sin valores hardcoded de color -- usar variantes de Badge existentes
- El DropdownMenu sigue el patrón de dropdowns existentes en la tabla (como el de Acciones)
- El comportamiento de invalidar el queryKey mantiene la tabla sincronizada con la BD

## Beneficios
- Cambio rápido de categoría sin abrir modal
- UX inline consistente con patrones de tablas editable en sistemas modernos
- Sincronización automática con Supabase vía TanStack Query
- Sin necesidad de refrescar la página
