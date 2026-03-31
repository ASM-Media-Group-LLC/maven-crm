

## Plan: Fix Promolog entries visibility para agentes + Fix auto-hide stats en Closers

### Problema 1: Agente no ve entradas subidas en Promolog

**Causa raíz**: Las entradas creadas antes del fix de `reviewed_by` tienen ese campo en `NULL`. El filtro `.eq("reviewed_by", user.id)` las excluye. Además, el `queryKey` no incluye `user.id`, lo que podría causar cache inconsistente entre roles.

**Solución**:

1. **Backfill de datos existentes** — Migración SQL que asigne `reviewed_by` a las entradas huérfanas. Se puede inferir el agente si hay un solo usuario agente activo, o pedirle al usuario que confirme. Opción más segura:

```sql
-- Asignar entradas sin reviewed_by al usuario que las creó
-- Como no hay campo created_by, buscar por la sesión de Carolina Jaramillo
UPDATE promolog_entries 
SET reviewed_by = (SELECT id FROM profiles WHERE full_name ILIKE '%Carolina%Jaramillo%' LIMIT 1)
WHERE reviewed_by IS NULL;
```

Alternativamente, si hay múltiples agentes, se necesita una asignación manual o un criterio más específico.

2. **Agregar `user.id` al queryKey** — Para que el cache sea correcto por usuario:

```tsx
queryKey: ["promolog-entries", user?.id, dateFrom?.toISOString(), dateTo?.toISOString()],
```

3. **Verificar fecha/hora** — El insert usa `new Date().toISOString()` (UTC). La visualización usa `toLocaleDateString("es-ES")` y `toLocaleTimeString("es-ES")` que muestra hora local del navegador. Esto debería estar correcto, pero si el servidor está en otra timezone podría verse desfasado. Se verificará que la hora mostrada corresponda.

### Problema 2: Stats cards no se ocultan al scrollear en Closers

**Causa raíz**: El componente `DataTableShell` tiene `onScroll` correctamente wired (línea 234) y el handler `handleContentScroll` está definido (línea 48-50). La estructura es idéntica a LeadGen. Posible causa: al cambiar de pestaña no se resetea `statsCollapsed` a `false`, causando inconsistencia. También verificar si el `scrollTop` del div se resetea correctamente.

**Solución**: Agregar reset de `statsCollapsed` al cambiar de tab:

```tsx
// En el onValueChange del Tabs
onValueChange={(v) => { setActiveTab(v); setStatsCollapsed(false); }}
```

Y asegurar que el scroll event se propague correctamente verificando que no haya un contenedor intermedio absorbiendo el scroll.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| Migración SQL | Backfill `reviewed_by` en entradas NULL |
| `PromologContent.tsx` | Agregar `user?.id` al queryKey (línea 169) |
| `ClosersContent.tsx` | Reset `statsCollapsed` en cambio de tab (línea 106) |

