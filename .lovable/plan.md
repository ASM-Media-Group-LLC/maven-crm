

## Plan: Badges dinámicos para Promolog, LeadGen, Closers y Messenger

### Problema actual
- **Promolog**: badge hardcodeado como `97` (no es dato real)
- **LeadGen**: sin badge
- **Closers**: sin badge
- **Messenger**: ya funciona con `useUnreadChatCount()`

### Qué representará cada badge
Basado en "pendientes por revisar":
- **Promolog**: entradas donde `reviewed_by IS NULL` (sin revisar)
- **LeadGen**: entradas donde `quality = 'pending'` o `status IS NULL` (sin calificar)
- **Closers**: leads en stage `'Nuevo'` (sin asignar/gestionar)
- **Messenger**: ya funciona correctamente

### Implementación

**1. Crear hook `useSidebarBadges.ts`**
Un solo hook que hace 3 queries ligeras (count only) en paralelo y devuelve `{ promologCount, leadgenCount, closersCount }`:

```ts
// Promolog: entries sin revisar
supabase.from("promolog_entries").select("id", { count: "exact", head: true }).is("reviewed_by", null)

// LeadGen: entries pendientes de calificación
supabase.from("leadgen_entries").select("id", { count: "exact", head: true }).eq("quality", "pending")

// Closers: leads en etapa "Nuevo"
supabase.from("closer_creators").select("id", { count: "exact", head: true }).eq("stage", "Nuevo")
```

Usa `useQuery` con `refetchInterval: 60000` (1 min) para mantener actualizados sin ser agresivo. Se cachea con React Query.

**2. Modificar `DashboardSidebar.tsx`**
- Importar `useSidebarBadges`
- Reemplazar el `badge: 97` hardcodeado de Promolog con `badge: promologCount || undefined`
- Agregar `badge: leadgenCount || undefined` a LeadGen
- Agregar `badge: closersCount || undefined` a Closers

### Archivos
- **Crear**: `src/hooks/useSidebarBadges.ts`
- **Modificar**: `src/components/dashboard/DashboardSidebar.tsx`

