

## Plan: Corregir asignación y reasignación en Closers

### Problemas identificados

1. **La mutación `assignCreator` solo actualiza `assigned_to` pero NO cambia el stage a "Asignada"**. Los creators en stage "Nuevo" se asignan pero permanecen en "Nuevo", no aparecen en la pestaña "Asignaciones".

2. **No hay manejo de errores** en `assignCreator` — los fallos son silenciosos (no hay `onError`).

3. **No se invalidan los conteos** (`closer-creators-counts`) después de asignar, así que los KPIs no se actualizan.

4. **El botón "Asignar" del header solo es visible para admins** pero supervisores también deberían poder usarlo (según la lógica del sistema).

### Cambios

**1. `src/pages/closers/hooks/useCloserLeads.ts` — Mutación `assignCreator` (líneas 363-372)**

Actualizar para que también cambie el `stage` a `"Asignada"` cuando el stage actual sea `"Nuevo"` o `"Pendiente LG"`, agregar `onError` y invalidar conteos:

```ts
const assignCreator = useMutation({
  mutationFn: async ({ id, assigned_to }: { id: string; assigned_to: string }) => {
    // First get current stage
    const { data: current } = await supabase
      .from("closer_creators")
      .select("stage")
      .eq("id", id)
      .single();
    
    const updates: Record<string, unknown> = { assigned_to };
    // Auto-advance stage if in early stages
    if (current?.stage === "Nuevo" || current?.stage === "Pendiente LG") {
      updates.stage = "Asignada";
    }
    
    const { error } = await supabase.from("closer_creators").update(updates).eq("id", id);
    if (error) throw error;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["closer-creators-list"] });
    queryClient.invalidateQueries({ queryKey: ["closer-creators-counts"] });
    toast({ title: "Creator asignada" });
  },
  onError: (e: Error) => {
    toast({ title: "Error al asignar", description: e.message, variant: "destructive" });
  },
});
```

**2. `src/pages/closers/ClosersContent.tsx` — Botón header (línea 64)**

Cambiar `{isAdmin && (` por `{(isAdmin || isManager) && (` para que supervisores/managers también puedan asignar desde el header.

### Resultado
- Asignar un creator lo moverá automáticamente a "Asignada" si estaba en "Nuevo" o "Pendiente LG"
- Reasignar un creator ya asignado/confirmado solo cambiará el `assigned_to` sin alterar el stage
- Los errores se mostrarán al usuario
- Los KPIs se actualizarán tras asignar

