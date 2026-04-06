

# Plan: Arreglar placeholder de búsqueda en LeadGen + Badges del sidebar por rol

## Cambios

### 1. Placeholder del buscador — `LeadGenContent.tsx` (línea 273)
Cambiar `"Buscar lead, agente..."` → `"Buscar lead..."`

### 2. Badges del sidebar adaptados al rol — `useSidebarBadges.ts`
Actualmente los badges muestran conteos globales sin respetar el `data_scope` del rol. Un closer con `data_scope: "self"` en Promolog ve 63 promos pendientes que no le corresponden.

**Solución**: Importar `useUserRole` y `usePermissions` en `useSidebarBadges`. Para cada módulo:
- Si el usuario **no tiene acceso** al módulo (`canAccess` = false), retornar 0 (no mostrar badge).
- Si el `data_scope` es `"self"`, filtrar las queries por `reviewed_by = user.id` (promolog) o `created_by = user.id` / `assigned_to = user.id` (leadgen, closers).
- Si es `"all"` o admin, mantener la query actual sin filtro.

**Detalle por módulo**:
- **Promolog**: Si scope es `self`, agregar `.or(\`reviewed_by.eq.${userId},created_by.eq.${userId}\`)` a la query.
- **LeadGen**: Si scope es `self`, agregar `.eq("assigned_to", userId)` o similar.
- **Closers**: Si scope es `self`, agregar `.eq("assigned_closer", userId)`.

## Archivos modificados
| Archivo | Cambio |
|---------|--------|
| `LeadGenContent.tsx` | Placeholder: `"Buscar lead..."` |
| `useSidebarBadges.ts` | Filtrar badges según `canAccess` y `dataScope` del usuario |

