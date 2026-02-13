

## Cargar creadores desde Supabase en el dropdown de Filtros

### Archivo: `src/pages/promolog/PromologContent.tsx`

**Cambio 1 - Agregar imports:**
- Importar `useQuery` de `@tanstack/react-query`
- Importar `supabase` de `@/integrations/supabase/client`

**Cambio 2 - Agregar query de creadores:**
Dentro del componente `PromologContent`, agregar un `useQuery` que traiga los creadores:

```tsx
const { data: creators = [] } = useQuery({
  queryKey: ["creators-dropdown"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("creators")
      .select("id, name, artistic_name")
      .order("name");
    if (error) throw error;
    return data;
  },
});
```

**Cambio 3 - Actualizar el Select de Creador/a (lineas 373-378):**
Reemplazar el dropdown estatico con los creadores cargados de la base de datos:

```tsx
<Select>
  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="__all__">Todos</SelectItem>
    {creators.map((c) => (
      <SelectItem key={c.id} value={c.id}>
        {c.name}{c.artistic_name ? ` (${c.artistic_name})` : ""}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

Esto muestra el nombre completo del creador y, si tiene nombre artistico, lo agrega entre parentesis para facilitar la identificacion.

