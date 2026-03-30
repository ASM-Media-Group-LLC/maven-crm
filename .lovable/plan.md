

## Plan: Corregir flujo de datos — Closers debe recibir contactos desde /contactos, no directamente de LeadGen

### Problema identificado

Actualmente hay **dos caminos** por los que entran registros a `closer_creators`:

1. **Directo desde LeadGen**: `convertLeadgenEntry` en `useCloserLeads.ts` inserta directamente en `closer_creators` desde datos de `leadgen_entries`. Esto **no es correcto**.
2. **Desde Contactos (correcto)**: El trigger `sync_closers_contact_to_creators` sincroniza contactos de `closers_contacts` → `closer_creators` cuando tienen teléfono.

El flujo correcto es: **LeadGen → Contactos → Closers**

El `ConvertLeadModal.tsx` en LeadGen ya inserta en `closers_contacts` (línea 70-79), lo cual es correcto. Pero **también** inserta directamente en `closer_creators` (líneas 33-65), creando duplicados o saltándose el paso de Contactos.

### Cambios propuestos

#### 1. `src/pages/leadgen/ConvertLeadModal.tsx` — Simplificar conversión

Eliminar la inserción directa a `closer_creators`. El flujo debe ser:
- Insertar en `closers_contacts` (ya lo hace)
- Marcar el lead como "contactado" (ya lo hace)
- El trigger `sync_closers_contact_to_creators` se encarga de crear el registro en `closer_creators` automáticamente

Eliminar las líneas 32-65 que buscan/insertan en `closer_creators` directamente.

#### 2. `src/pages/closers/hooks/useCloserLeads.ts` — Eliminar `convertLeadgenEntry`

La mutación `convertLeadgenEntry` (líneas 431-468) ya no es necesaria porque los leads no entran directamente a Closers. Eliminarla del hook y de las exportaciones.

#### 3. `src/pages/closers/ClosersContent.tsx` — Limpiar referencias

Eliminar todas las referencias a `convertLeadgenEntry` y la lógica condicional `source === "leadgen"` en los handlers `onStageChange` y `onAssign`.

### Resultado esperado

- Los leads de LeadGen se convierten a contactos en `/contactos`
- Solo los contactos con teléfono se sincronizan automáticamente a Closers via trigger
- Se elimina el camino directo LeadGen → Closers
- Sin duplicados

### Archivos a modificar
- `src/pages/leadgen/ConvertLeadModal.tsx`
- `src/pages/closers/hooks/useCloserLeads.ts`
- `src/pages/closers/ClosersContent.tsx`

