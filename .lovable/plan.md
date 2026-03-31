

## Plan: Fix badge de Promolog — deduplicar conteo

### Problema
El badge del sidebar cuenta **412 filas crudas** (`reviewed_by IS NULL` hoy), pero la UI muestra **57 entradas** porque aplica deduplicación. El badge debe reflejar el mismo número que la UI.

### Solución

**Archivo: `src/hooks/useSidebarBadges.ts`**

Cambiar la query de Promolog para que en lugar de contar con `head: true` (que cuenta filas crudas), traiga los datos del día, aplique la misma deduplicación del frontend, y retorne ese conteo:

```tsx
// Promolog: traer entradas de hoy sin revisar, deduplicar, contar
const { data: promoData } = await supabase
  .from("promolog_entries")
  .select("id, creator_id, date, network, platform, promoted")
  .is("reviewed_by", null)
  .gte("date", new Date().toISOString().split("T")[0]);

const promoDeduped = new Set(
  (promoData ?? []).map(e => {
    const dayKey = e.date?.split("T")[0] ?? e.date;
    return `${e.creator_id}|${dayKey}|${e.network}|${e.platform}|${e.promoted}`;
  })
);

return {
  promologCount: promoDeduped.size,
  leadgenCount: leadgen.count ?? 0,
  closersCount: closers.count ?? 0,
};
```

Esto aplica la misma lógica de clave compuesta que `PromologContent.tsx` usa para deduplicar, garantizando que el badge muestre ~57 (el conteo real sin duplicados).

