

## Plan: Fix eliminación de entradas + visibilidad para Carolina en Promolog

### Problema 1: Las entradas NO se borran

En `PromologContent.tsx` línea 1403, el botón "Eliminar" solo cierra el dialog y muestra un toast — **nunca llama a Supabase para eliminar**:

```tsx
// ACTUAL (fake delete)
onClick={() => { setDeleteEntryOpen(false); toast({ title: "Entrada eliminada" }); }}
```

**Fix**: Reemplazar con una llamada real a `supabase.from("promolog_entries").delete().eq("id", selectedEntry.id)` seguida de `invalidateQueries`.

### Problema 2: Carolina no ve entradas de "sofiaen el mundo"

Las 31,205 entradas en la DB tienen `created_by = NULL`. Solo 4,059 tienen `reviewed_by` seteado. Las entradas de "sofiaen el mundo" (y la mayoría) vienen del webhook externo (`sync-promolog-external`) que **no setea** `reviewed_by` ni `created_by`.

El filtro para agentes (línea 178-179) busca `reviewed_by.eq.${user.id},created_by.eq.${user.id}` → no encuentra nada.

**Fix en dos partes**:

1. **Backfill SQL** — Asignar `reviewed_by` a Carolina (`e3355f39-1d3c-4986-99d1-ee583df9b38c`) en todas las entradas huérfanas. Si hay múltiples agentes, se necesita un criterio. Como parece haber un solo agente activo, se asignan todas a ella.

```sql
UPDATE promolog_entries 
SET reviewed_by = 'e3355f39-1d3c-4986-99d1-ee583df9b38c'
WHERE reviewed_by IS NULL;
```

2. **Fix del webhook** — Actualizar la edge function `sync-promolog-external` para que setee `reviewed_by` al insertar, si es posible identificar al agente. Alternativamente, cambiar la query del agente para que vea **todas** las entradas (sin filtro por usuario) ya que RLS está deshabilitado y el filtro client-side es innecesario si solo hay un agente.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `PromologContent.tsx` línea 1403 | Implementar delete real con `supabase.delete()` + `invalidateQueries` |
| Migración SQL | Backfill: `UPDATE promolog_entries SET reviewed_by = 'e3355f39...' WHERE reviewed_by IS NULL` |

### Detalle del fix de delete

```tsx
<Button variant="destructive" onClick={async () => {
  const { error } = await supabase
    .from("promolog_entries")
    .delete()
    .eq("id", selectedEntry.id);
  if (error) {
    toast({ title: "Error al eliminar", description: error.message, variant: "destructive" });
    return;
  }
  queryClient.invalidateQueries({ queryKey: ["promolog-entries", user?.id] });
  setDeleteEntryOpen(false);
  toast({ title: "Entrada eliminada" });
}}>Eliminar</Button>
```

