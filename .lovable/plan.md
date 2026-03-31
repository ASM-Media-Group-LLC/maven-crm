

## Plan: Deduplicar entradas de Promolog en el frontend (sin borrar datos)

### Problema
Existen entradas duplicadas en la base de datos (mismo `creator_id`, `date`, `network`, `platform`, `promoted`) pero con diferencias en campos como `evidence_url`, `notes`, `reviewed_by`, etc. No se deben eliminar — solo mostrar una por grupo.

### Solución

Agregar una función de deduplicación en el `useMemo` que mapea `promologEntries` a `entries` en `PromologContent.tsx`. La lógica:

1. Agrupar por clave compuesta: `creator_id + date (solo día) + network + platform + promoted`
2. De cada grupo, conservar la entrada que tenga **más datos** (priorizar la que tenga `evidence_url`, `notes`, `reviewed_by`, etc.)
3. Solo la entrada seleccionada se pasa al array final

### Archivo a modificar

**`src/pages/promolog/PromologContent.tsx`** — entre líneas 193-196, después del fetch y antes del mapeo:

```tsx
// Después de: const { data, error } = await query;
// Deduplicar: mantener la entrada más completa de cada grupo
const deduped = (() => {
  const map = new Map<string, any>();
  for (const e of data ?? []) {
    const dayKey = e.date?.split("T")[0] ?? e.date;
    const key = `${e.creator_id}|${dayKey}|${e.network}|${e.platform}|${e.promoted}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, e);
    } else {
      // Preferir la que tenga más campos llenos
      const score = (r: any) =>
        (r.evidence_url ? 1 : 0) +
        (r.notes ? 1 : 0) +
        (r.reviewed_by ? 1 : 0) +
        (r.action_taken ? 1 : 0);
      if (score(e) > score(existing)) {
        map.set(key, e);
      }
    }
  }
  return Array.from(map.values());
})();
return deduped;
```

Esto reemplaza el `return data` actual en la queryFn. Los duplicados quedan intactos en la DB pero no aparecen en la UI.

### Impacto
- Las stats cards (KPIs) también se calcularán sobre datos deduplicados, reflejando conteos reales
- La tabla y las cards mostrarán solo entradas únicas
- No se modifica la base de datos

