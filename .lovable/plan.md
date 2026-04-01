

## Plan: Fix sidebar badges — solo entradas nuevas del día

### Problema

`useSidebarBadges.ts` cuenta **todos** los registros sin filtro de fecha:
- **Closers**: `stage = 'Nuevo'` → 441 (acumulado histórico)
- **LeadGen**: `quality = 'pending'` → sin filtro de fecha tampoco

El badge debería mostrar solo las entradas creadas **hoy** que el usuario aún no ha procesado.

### Fix

**Archivo**: `src/hooks/useSidebarBadges.ts`

Agregar filtro `.gte("created_at", todayISO)` a las queries de Closers y LeadGen:

```ts
const today = new Date().toISOString().split("T")[0];

// Closers: solo leads nuevos creados hoy
supabase.from("closer_creators")
  .select("id", { count: "exact", head: true })
  .eq("stage", "Nuevo")
  .gte("created_at", today)

// LeadGen: solo pending creados hoy
supabase.from("leadgen_entries")
  .select("id", { count: "exact", head: true })
  .eq("quality", "pending")
  .gte("created_at", today)
```

Promolog ya filtra por fecha del día (`gte("date", today)`), así que está correcto.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/hooks/useSidebarBadges.ts` | Agregar `.gte("created_at", today)` a queries de closers y leadgen |

